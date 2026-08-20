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

console.log("devices worker tests: ok");
