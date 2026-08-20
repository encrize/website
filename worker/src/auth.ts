import { DEVICE_CONFIG, type DeviceId } from "./devices";
import type { Env } from "./types";

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function secureEqual(left: string, right: string): Promise<boolean> {
	const [a, b] = await Promise.all([sha256(left), sha256(right)]);
	let difference = 0;
	for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
	return difference === 0;
}

export async function hasValidDeviceToken(request: Request, env: Env, id: DeviceId): Promise<boolean> {
	const header = request.headers.get("Authorization");
	if (!header) return false;
	const match = /^Bearer\s+(.+)$/i.exec(header);
	const supplied = match?.[1]?.trim();
	if (!supplied) return false;

	const binding = DEVICE_CONFIG[id].tokenBinding;
	const expected = env[binding];
	if (!expected) return false;
	return secureEqual(supplied, expected);
}
