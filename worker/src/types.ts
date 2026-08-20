export interface KVNamespaceLike {
	get(key: string): Promise<string | null>;
	put(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
}

export interface Env {
	DEVICES_KV: KVNamespaceLike;
	LINUX_LAPTOP_TOKEN?: string;
	ANDROID_PHONE_TOKEN?: string;
	IPHONE_6_TOKEN?: string;
	MACBOOK_TOKEN?: string;
	ALLOWED_ORIGIN?: string;
	LISTENBRAINZ_USER?: string;
}

export type TokenBinding =
	| "LINUX_LAPTOP_TOKEN"
	| "ANDROID_PHONE_TOKEN"
	| "IPHONE_6_TOKEN"
	| "MACBOOK_TOKEN";

export interface DeviceRecord {
	device: string;
	displayName: string;
	level: number | null;
	charging: boolean;
	lowPowerMode: boolean;
	wifi: string | null;
	accessories: string[];
	updatedAt: string;
}

export type DevicePatch = Partial<
	Pick<DeviceRecord, "level" | "charging" | "lowPowerMode" | "wifi" | "accessories">
>;
