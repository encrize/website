import type { DevicePatch, DeviceRecord, Env, TokenBinding } from "./types";

interface DeviceDefinition {
	displayName: string;
	tokenBinding: TokenBinding;
}

export const DEVICE_CONFIG = {
	"linux-laptop": {
		displayName: "Linux laptop",
		tokenBinding: "LINUX_LAPTOP_TOKEN",
	},
	"android-phone": {
		displayName: "Android",
		tokenBinding: "ANDROID_PHONE_TOKEN",
	},
	"iphone-6": {
		displayName: "iPhone 6 · homelab",
		tokenBinding: "IPHONE_6_TOKEN",
	},
	// Optional; absent from GET until it reports.
	macbook: {
		displayName: "MacBook",
		tokenBinding: "MACBOOK_TOKEN",
	},
} as const satisfies Record<string, DeviceDefinition>;

export type DeviceId = keyof typeof DEVICE_CONFIG;

export function isDeviceId(value: string): value is DeviceId {
	return Object.prototype.hasOwnProperty.call(DEVICE_CONFIG, value);
}

export function jsonResponse(value: unknown, status = 200, extraHeaders?: HeadersInit): Response {
	const headers = new Headers(extraHeaders);
	headers.set("Content-Type", "application/json; charset=utf-8");
	headers.set("Cache-Control", "no-store");
	return new Response(JSON.stringify(value), { status, headers });
}

function defaultRecord(id: DeviceId): DeviceRecord {
	return {
		device: id,
		displayName: DEVICE_CONFIG[id].displayName,
		level: null,
		charging: false,
		lowPowerMode: false,
		wifi: null,
		accessories: [],
		updatedAt: new Date(0).toISOString(),
	};
}

async function readRecord(env: Env, id: DeviceId): Promise<DeviceRecord | null> {
	const raw = await env.DEVICES_KV.get(`device:${id}`);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<DeviceRecord>;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		return {
			...defaultRecord(id),
			...parsed,
			device: id,
			displayName: DEVICE_CONFIG[id].displayName,
		};
	} catch {
		return null;
	}
}

function validatePatch(input: unknown): { ok: true; value: DevicePatch } | { ok: false; message: string } {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return { ok: false, message: "JSON body must be an object" };
	}

	const source = input as Record<string, unknown>;
	const allowed = new Set(["level", "charging", "lowPowerMode", "wifi", "accessories"]);
	const unknown = Object.keys(source).filter((key) => !allowed.has(key));
	if (unknown.length) return { ok: false, message: `Unknown field: ${unknown[0]}` };

	const patch: DevicePatch = {};

	if (Object.prototype.hasOwnProperty.call(source, "level")) {
		if (source.level !== null && (!Number.isInteger(source.level) || (source.level as number) < 0 || (source.level as number) > 100)) {
			return { ok: false, message: "level must be an integer from 0 to 100, or null" };
		}
		patch.level = source.level as number | null;
	}

	for (const field of ["charging", "lowPowerMode"] as const) {
		if (Object.prototype.hasOwnProperty.call(source, field)) {
			if (typeof source[field] !== "boolean") return { ok: false, message: `${field} must be a boolean` };
			patch[field] = source[field];
		}
	}

	if (Object.prototype.hasOwnProperty.call(source, "wifi")) {
		if (source.wifi !== null && typeof source.wifi !== "string") {
			return { ok: false, message: "wifi must be a string or null" };
		}
		if (typeof source.wifi === "string") {
			const wifi = source.wifi.trim();
			if (wifi.length > 128) return { ok: false, message: "wifi is too long" };
			patch.wifi = wifi || null;
		} else {
			patch.wifi = null;
		}
	}

	if (Object.prototype.hasOwnProperty.call(source, "accessories")) {
		if (!Array.isArray(source.accessories) || source.accessories.length > 24) {
			return { ok: false, message: "accessories must be an array with at most 24 items" };
		}
		const tags: string[] = [];
		for (const item of source.accessories) {
			if (typeof item !== "string") return { ok: false, message: "every accessory must be a string" };
			const tag = item.trim();
			if (!tag || tag.length > 48) return { ok: false, message: "accessory tags must be 1-48 characters" };
			if (!tags.includes(tag)) tags.push(tag);
		}
		patch.accessories = tags;
	}

	return { ok: true, value: patch };
}

export async function getDevices(env: Env): Promise<Response> {
	const ids = Object.keys(DEVICE_CONFIG) as DeviceId[];
	const entries = await Promise.all(ids.map(async (id) => [id, await readRecord(env, id)] as const));
	const output: Record<string, DeviceRecord> = {};
	for (const [id, record] of entries) if (record) output[id] = record;
	return jsonResponse(output);
}

export async function postDevice(request: Request, env: Env, id: DeviceId): Promise<Response> {
	const contentLength = Number(request.headers.get("Content-Length") || "0");
	if (contentLength > 16_384) return jsonResponse({ error: "Request body is too large" }, 413);

	const contentType = request.headers.get("Content-Type") || "";
	if (contentType && !contentType.toLowerCase().includes("application/json")) {
		return jsonResponse({ error: "Content-Type must be application/json" }, 415);
	}

	let body: unknown;
	try {
		const text = await request.text();
		if (text.length > 16_384) return jsonResponse({ error: "Request body is too large" }, 413);
		body = text ? JSON.parse(text) : {};
	} catch {
		return jsonResponse({ error: "Malformed JSON" }, 400);
	}

	const validated = validatePatch(body);
	if (!validated.ok) return jsonResponse({ error: validated.message }, 400);

	const current = (await readRecord(env, id)) ?? defaultRecord(id);
	const record: DeviceRecord = {
		...current,
		...validated.value,
		device: id,
		displayName: DEVICE_CONFIG[id].displayName,
		updatedAt: new Date().toISOString(),
	};
	await env.DEVICES_KV.put(`device:${id}`, JSON.stringify(record));
	return jsonResponse(record);
}

export async function deleteDevice(env: Env, id: DeviceId): Promise<Response> {
	await env.DEVICES_KV.delete(`device:${id}`);
	return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
