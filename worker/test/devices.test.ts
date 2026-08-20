import assert from "node:assert/strict";
import worker from "../src/index";
import type { Env, KVNamespaceLike } from "../src/types";

class MemoryKV implements KVNamespaceLike {
	private values = new Map<string, string>();
	async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
	async put(key: string, value: string): Promise<void> { this.values.set(key, value); }
	async delete(key: string): Promise<void> { this.values.delete(key); }
}

const env: Env = {
	DEVICES_KV: new MemoryKV(),
	LINUX_LAPTOP_TOKEN: "linux-secret",
	ANDROID_PHONE_TOKEN: "android-secret",
	IPHONE_6_TOKEN: "iphone-secret",
	ALLOWED_ORIGIN: "https://encrize.vip",
	LISTENBRAINZ_USER: "encrize",
};

async function call(path: string, init?: RequestInit) {
	return worker.fetch(new Request(`https://encrize.vip${path}`, init), env);
}

let response = await call("/api/devices");
assert.equal(response.status, 200);
assert.equal(response.headers.get("Cache-Control"), "no-store");
assert.deepEqual(await response.json(), {});

response = await call("/api/devices/not-allowed", { method: "POST" });
assert.equal(response.status, 404);

response = await call("/api/devices/linux-laptop", {
	method: "POST",
	headers: { "Authorization": "Bearer wrong", "Content-Type": "application/json" },
	body: JSON.stringify({ level: 81 }),
});
assert.equal(response.status, 401);

response = await call("/api/devices/linux-laptop", {
	method: "POST",
	headers: { "Authorization": "Bearer linux-secret", "Content-Type": "application/json" },
	body: JSON.stringify({ level: 81, charging: false, wifi: "lab", accessories: ["mouse"] }),
});
assert.equal(response.status, 200);
const created = await response.json() as Record<string, unknown>;
assert.equal(created.device, "linux-laptop");
assert.equal(created.displayName, "Linux laptop");
assert.equal(created.level, 81);
assert.ok(Date.parse(String(created.updatedAt)) > 0);

response = await call("/api/devices/linux-laptop", {
	method: "POST",
	headers: { "Authorization": "Bearer linux-secret", "Content-Type": "application/json" },
	body: JSON.stringify({ charging: true }),
});
const merged = await response.json() as Record<string, unknown>;
assert.equal(merged.level, 81);
assert.equal(merged.charging, true);
assert.equal(merged.wifi, "lab");

response = await call("/api/devices/linux-laptop", {
	method: "POST",
	headers: { "Authorization": "Bearer linux-secret", "Content-Type": "application/json" },
	body: JSON.stringify({ level: 101 }),
});
assert.equal(response.status, 400);

response = await call("/api/devices/linux-laptop", {
	method: "DELETE",
	headers: { "Authorization": "Bearer linux-secret" },
});
assert.equal(response.status, 204);
assert.deepEqual(await (await call("/api/devices")).json(), {});

const realFetch = globalThis.fetch;
let musicFetches = 0;
globalThis.fetch = async (input: string | URL | Request) => {
	const url = String(input);
	if (!url.startsWith("https://api.listenbrainz.org/")) return realFetch(input);
	musicFetches += 1;
	return new Response(JSON.stringify({
		payload: {
			listens: [{
				listened_at: 1787229000,
				track_metadata: {
					track_name: "Everything In Its Right Place",
					artist_name: "Radiohead",
					additional_info: { release_mbid: "a8cb2f10-ec41-4cf5-979e-69274b5aa4aa" },
				},
			}],
		},
	}), { status: 200, headers: { "Content-Type": "application/json" } });
};

response = await call("/api/music");
assert.equal(response.status, 200);
const music = await response.json() as Record<string, unknown>;
assert.equal(music.title, "Everything In Its Right Place");
assert.equal(music.artist, "Radiohead");
assert.equal(music.playedAt, "2026-08-20T12:30:00.000Z");
assert.match(String(music.coverUrl), /coverartarchive\.org\/release\//);
response = await call("/api/music");
assert.equal(response.status, 200);
assert.equal(musicFetches, 1);
globalThis.fetch = realFetch;

console.log("devices worker tests: ok");
