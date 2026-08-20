#!/usr/bin/env node

const USER = process.env.GITHUB_USER || "encrize";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUT_PATH = new URL("../index/data/language-stats.json", import.meta.url);

const headers = {
	Accept: "application/vnd.github+json",
	"X-GitHub-Api-Version": "2022-11-28",
	"User-Agent": `${USER}-language-stats-script`,
};
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

async function ghFetch(url) {
	const res = await fetch(url, { headers });
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`GitHub API ${res.status} for ${url}: ${body.slice(0, 200)}`);
	}
	return res.json();
}

async function fetchAllRepos(user) {
	const repos = [];
	let page = 1;
	for (;;) {
		const batch = await ghFetch(
			`https://api.github.com/users/${user}/repos?per_page=100&type=owner&sort=pushed&page=${page}`
		);
		if (!batch.length) break;
		repos.push(...batch);
		if (batch.length < 100) break;
		page++;
	}
	return repos;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
	console.log(`Fetching repos for ${USER}...`);
	const repos = await fetchAllRepos(USER);

	const candidates = repos.filter((r) => !r.fork && !r.archived);
	console.log(`${repos.length} repos total, ${candidates.length} counted (no forks/archived).`);

	const totals = {};
	let total = 0;
	let counted = 0;
	const errors = [];

	for (const repo of candidates) {
		try {
			const langs = await ghFetch(`https://api.github.com/repos/${USER}/${repo.name}/languages`);
			const repoBytes = Object.values(langs).reduce((a, b) => a + b, 0);
			if (repoBytes > 0) {
				for (const [lang, bytes] of Object.entries(langs)) {
					totals[lang] = (totals[lang] || 0) + bytes;
					total += bytes;
				}
				counted++;
			}
		} catch (err) {
			errors.push(`${repo.name}: ${err.message}`);
		}
		await sleep(120);
	}

	if (errors.length) {
		console.warn(`Skipped ${errors.length} repo(s) due to errors:\n  ${errors.join("\n  ")}`);
	}

	const pairs = Object.entries(totals).sort((a, b) => b[1] - a[1]);

	if (!pairs.length || !total) {
		throw new Error("No language data collected - refusing to overwrite existing stats file.");
	}

	const payload = {
		generatedAt: new Date().toISOString(),
		user: USER,
		total,
		repos: counted,
		pairs,
	};

	const fs = await import("node:fs/promises");
	await fs.mkdir(new URL("../index/data/", import.meta.url), { recursive: true });
	await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, "\t") + "\n", "utf8");

	console.log(`Wrote ${OUT_PATH.pathname}`);
	console.log(`Top language: ${pairs[0][0]} (${((pairs[0][1] / total) * 100).toFixed(1)}%)`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
