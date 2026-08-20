import { jsonResponse } from "./devices";
import type { Env } from "./types";

const CACHE_KEY = "music:last-listen:v1";
const CACHE_TTL_MS = 2 * 60 * 1000;

interface MusicCard {
	title: string;
	artist: string;
	playedAt: string;
	coverUrl: string | null;
}

interface CachedMusic {
	expiresAt: number;
	data: MusicCard;
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function uuid(value: unknown): string {
	const candidate = text(value);
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
		? candidate
		: "";
}

function normalizeListen(payload: unknown): MusicCard | null {
	if (!payload || typeof payload !== "object") return null;
	const root = payload as Record<string, unknown>;
	const body = root.payload;
	if (!body || typeof body !== "object") return null;
	const listens = (body as Record<string, unknown>).listens;
	if (!Array.isArray(listens) || !listens.length || !listens[0] || typeof listens[0] !== "object") return null;

	const listen = listens[0] as Record<string, unknown>;
	const metadata = listen.track_metadata;
	if (!metadata || typeof metadata !== "object") return null;
	const track = metadata as Record<string, unknown>;
	const title = text(track.track_name);
	const artist = text(track.artist_name);
	if (!title || !artist) return null;

	const listenedAt = Number(listen.listened_at);
	if (!Number.isFinite(listenedAt) || listenedAt <= 0) return null;

	const additional = track.additional_info && typeof track.additional_info === "object"
		? track.additional_info as Record<string, unknown>
		: {};
	const mapping = track.mbid_mapping && typeof track.mbid_mapping === "object"
		? track.mbid_mapping as Record<string, unknown>
		: {};
	const releaseMbid = uuid(additional.release_mbid) || uuid(mapping.caa_release_mbid) || uuid(mapping.release_mbid);

	return {
		title,
		artist,
		playedAt: new Date(listenedAt * 1000).toISOString(),
		coverUrl: releaseMbid ? "https:" + "//coverartarchive.org/release/" + releaseMbid + "/front-250" : null,
	};
}

async function readCache(env: Env): Promise<CachedMusic | null> {
	try {
		const raw = await env.DEVICES_KV.get(CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CachedMusic;
		if (!parsed || !parsed.data || typeof parsed.expiresAt !== "number") return null;
		return parsed;
	} catch {
		return null;
	}
}

export async function getLastListen(env: Env): Promise<Response> {
	const cached = await readCache(env);
	if (cached && cached.expiresAt > Date.now()) return jsonResponse(cached.data);

	const username = (env.LISTENBRAINZ_USER || "encrize").trim();
	try {
		const endpoint = "https:" + "//api.listenbrainz.org/1/user/" + encodeURIComponent(username) + "/listens?count=1";
		const response = await fetch(endpoint, {
			headers: { "Accept": "application/json", "User-Agent": "encrize.vip music widget" },
		});
		if (!response.ok) throw new Error(`listenbrainz ${response.status}`);
		const data = normalizeListen(await response.json());
		if (!data) throw new Error("listenbrainz response has no listens");
		await env.DEVICES_KV.put(CACHE_KEY, JSON.stringify({ expiresAt: Date.now() + CACHE_TTL_MS, data }));
		return jsonResponse(data);
	} catch (error) {
		console.error("Last listen lookup failed", error);
		if (cached) return jsonResponse(cached.data);
		return jsonResponse({ error: "Music status unavailable" }, 503);
	}
}
