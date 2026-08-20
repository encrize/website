import { hasValidDeviceToken } from "./auth";
import { deleteDevice, getDevices, isDeviceId, jsonResponse, postDevice } from "./devices";
import type { Env } from "./types";

function withApiHeaders(response: Response, request: Request, env: Env): Response {
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", "no-store");
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Referrer-Policy", "no-referrer");

	const origin = request.headers.get("Origin");
	if (origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) {
		headers.set("Access-Control-Allow-Origin", origin);
		headers.set("Vary", "Origin");
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function preflight(request: Request, env: Env): Response {
	const origin = request.headers.get("Origin");
	if (origin && env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) {
		return jsonResponse({ error: "Origin is not allowed" }, 403);
	}
	const headers = new Headers({
		"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Authorization, Content-Type",
		"Access-Control-Max-Age": "86400",
		"Cache-Control": "no-store",
	});
	if (origin && env.ALLOWED_ORIGIN === origin) {
		headers.set("Access-Control-Allow-Origin", origin);
		headers.set("Vary", "Origin");
	}
	return new Response(null, { status: 204, headers });
}

function methodNotAllowed(allowed: string): Response {
	return jsonResponse({ error: "Method not allowed" }, 405, { Allow: allowed });
}

async function route(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

	if (request.method === "OPTIONS" && path.startsWith("/api/")) return preflight(request, env);

	if (path === "/api/devices") {
		if (request.method !== "GET") return methodNotAllowed("GET, OPTIONS");
		return getDevices(env);
	}

	const match = /^\/api\/devices\/([a-z0-9][a-z0-9-]{0,63})$/.exec(path);
	if (!match) return jsonResponse({ error: "Not found" }, 404);

	const id = match[1];
	if (!isDeviceId(id)) return jsonResponse({ error: "Unknown device" }, 404);
	if (request.method !== "POST" && request.method !== "DELETE") {
		return methodNotAllowed("POST, DELETE, OPTIONS");
	}

	if (!(await hasValidDeviceToken(request, env, id))) {
		return jsonResponse(
			{ error: "Unauthorized" },
			401,
			{ "WWW-Authenticate": 'Bearer realm="device reporter"' },
		);
	}

	if (request.method === "POST") return postDevice(request, env, id);
	return deleteDevice(env, id);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			return withApiHeaders(await route(request, env), request, env);
		} catch (error) {
			console.error("Unhandled devices API error", error);
			return withApiHeaders(jsonResponse({ error: "Internal server error" }, 500), request, env);
		}
	},
};
