(function () {
	var FEED = "https://blog.encrize.vip/feed.xml";
	var box = document.getElementById("latest-post");
	var link = document.getElementById("latest-post-link");
	var dateEl = document.getElementById("latest-post-date");
	if (!box || !link) return;

	function pick(node, names) {
		for (var i = 0; i < names.length; i++) {
			var el = node.getElementsByTagName(names[i])[0];
			if (el) return el;
		}
		return null;
	}

	function show(title, href, iso) {
		link.textContent = title;
		if (href) link.setAttribute("href", href);
		if (iso) {
			var d = new Date(iso);
			if (!isNaN(d)) {
				dateEl.textContent =
					"(" +
					d.toLocaleDateString("en-GB", {
						day: "numeric",
						month: "short",
						year: "numeric",
					}) +
					")";
			}
		}
		box.hidden = false;
	}

	var COOL_KEY = "feed-cooldown-v1";
	var HIT_KEY = "feed-hit-v1";
	var HIT_TTL = 30 * 60 * 1000;

	function stamp(key, ms) {
		try { localStorage.setItem(key, String(Date.now() + ms)); } catch (e) {}
	}
	function waiting(key) {
		try { return Date.now() < (Number(localStorage.getItem(key)) || 0); } catch (e) { return false; }
	}

	try {
		var hit = JSON.parse(localStorage.getItem(HIT_KEY) || "null");
		if (hit && Date.now() - hit.at < HIT_TTL) {
			show(hit.title, hit.href, hit.iso);
			return;
		}
	} catch (e) {}

	if (waiting(COOL_KEY)) return;

	fetch(FEED, { cache: "no-cache" })
		.then(function (r) {
			if (!r.ok) throw new Error("feed " + r.status);
			return r.text();
		})
		.then(function (xml) {
			var doc = new DOMParser().parseFromString(xml, "application/xml");
			if (doc.getElementsByTagName("parsererror").length) throw new Error("bad xml");
			var item =
				doc.getElementsByTagName("item")[0] || doc.getElementsByTagName("entry")[0];
			if (!item) throw new Error("empty feed");

			var titleEl = pick(item, ["title"]);
			var title = titleEl ? titleEl.textContent.trim() : "";
			if (!title) throw new Error("no title");

			var href = "";
			var linkEl = item.getElementsByTagName("link")[0];
			if (linkEl) href = linkEl.getAttribute("href") || linkEl.textContent.trim();

			var dateEl2 = pick(item, ["pubDate", "published", "updated", "date"]);
			var iso = dateEl2 ? dateEl2.textContent.trim() : "";
			try { localStorage.setItem(HIT_KEY, JSON.stringify({ at: Date.now(), title: title, href: href, iso: iso })); } catch (e) {}
			show(title, href, iso);
		})
		.catch(function () { stamp(COOL_KEY, HIT_TTL); });
})();

(function () {
	var STATS_URL = "/data/language-stats.json";
	var TOP = 6;
	var CACHE_KEY = "gh-langs-v3";
	var CACHE_TTL = 60 * 60 * 1000;
	var bar = document.getElementById("gh-bar");
	var list = document.getElementById("gh-list");
	var note = document.getElementById("gh-note");
	if (!bar || !list || !note) return;

	var COLORS = {
		"C": "#8f9aa8", "C++": "#f34b7d", "C#": "#178600", "Assembly": "#c9a227",
		"Kotlin": "#a97bff", "TypeScript": "#3178c6", "JavaScript": "#f1e05a",
		"Python": "#3572a5", "Rust": "#dea584", "Go": "#00add8", "Java": "#b07219",
		"Swift": "#f05138", "Shell": "#89e051", "HTML": "#e34c26", "CSS": "#563d7c",
		"Lua": "#000080", "Makefile": "#427819", "Dockerfile": "#384d54",
		"Nix": "#7e7eff", "Vim Script": "#199f4b", "Vim script": "#199f4b",
		"Zig": "#ec915c", "Objective-C": "#438eff", "Objective-C++": "#6866fb",
		"Batchfile": "#c1f12e", "PowerShell": "#012456", "Ruby": "#701516",
		"PHP": "#4f5d95", "Perl": "#0298c3", "Haskell": "#5e5086", "SCSS": "#c6538c"
	};
	var FALLBACK = ["#8b5cf6", "#a78bfa", "#7c3aed", "#6d28d9", "#4c1d95"];

	function fail() {
		note.textContent = "github stats unavailable right now";
	}

	function formatBytes(n) {
		if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
		if (n >= 1024) return Math.round(n / 1024) + " KB";
		return n + " B";
	}

	function render(pairs, total, repoCount) {
		if (!total || !pairs.length) return fail();

		var shown = pairs.slice(0, TOP);
		var frag = document.createDocumentFragment();
		var barFrag = document.createDocumentFragment();
		var covered = 0;
		var i;

		for (i = 0; i < shown.length; i++) {
			var name = shown[i][0];
			var pct = (shown[i][1] / total) * 100;
			var color = COLORS[name] || FALLBACK[i % FALLBACK.length];
			covered += pct;

			var seg = document.createElement("span");
			seg.style.width = pct.toFixed(2) + "%";
			seg.style.background = color;
			seg.title = name + " - " + formatBytes(shown[i][1]);
			barFrag.appendChild(seg);

			var li = document.createElement("li");
			var dot = document.createElement("i");
			dot.style.background = color;
			var label = document.createElement("b");
			label.textContent = name;
			li.appendChild(dot);
			li.appendChild(label);
			li.appendChild(document.createTextNode(pct.toFixed(1) + "%"));
			frag.appendChild(li);
		}

		var rest = 100 - covered;
		if (rest > 0.5) {
			var restSeg = document.createElement("span");
			restSeg.style.width = rest.toFixed(2) + "%";
			restSeg.style.background = "rgba(255,255,255,.22)";
			restSeg.title = "other - " + rest.toFixed(1) + "%";
			barFrag.appendChild(restSeg);
		}

		bar.textContent = "";
		bar.appendChild(barFrag);
		list.textContent = "";
		list.appendChild(frag);
		note.textContent =
			formatBytes(total) + " of code across " + repoCount + " public repositories";
	}

	function readCache() {
		try {
			var raw = localStorage.getItem(CACHE_KEY);
			if (!raw) return null;
			var data = JSON.parse(raw);
			if (!data || !data.pairs || Date.now() - data.at > CACHE_TTL) return null;
			return data;
		} catch (e) {
			return null;
		}
	}

	function writeCache(pairs, total, repoCount) {
		try {
			localStorage.setItem(
				CACHE_KEY,
				JSON.stringify({ at: Date.now(), pairs: pairs, total: total, repos: repoCount })
			);
		} catch (e) {}
	}

	var cached = readCache();
	if (cached) {
		render(cached.pairs, cached.total, cached.repos);
		return;
	}

	fetch(STATS_URL, { cache: "no-cache" })
		.then(function (r) {
			if (!r.ok) throw new Error("stats " + r.status);
			return r.json();
		})
		.then(function (data) {
			if (!data || !data.pairs || !data.pairs.length || !data.total) {
				throw new Error("no languages");
			}
			writeCache(data.pairs, data.total, data.repos);
			render(data.pairs, data.total, data.repos);
		})
		.catch(fail);
})();

(function(){
	var grid = document.querySelector(".projects");
	if(!grid) return;
	if(window.matchMedia && window.matchMedia("(hover:none)").matches) return;
	var card = null, spot = null, rect = null, x = 0, y = 0, frame = 0;
	function paint(){
		frame = 0;
		if(spot) spot.style.transform = "translate3d(" + x + "px," + y + "px,0)";
	}
	function drop(){ card = null; spot = null; rect = null; }
	grid.addEventListener("pointermove", function(e){
		if(e.pointerType === "touch") return;
		var hit = e.target && e.target.closest ? e.target.closest(".pcard") : null;
		if(!hit) return;
		if(hit !== card){
			card = hit;
			spot = hit.querySelector(".pcard-spot");
			rect = null;
		}
		if(!spot) return;
		if(!rect) rect = card.getBoundingClientRect();
		x = (e.clientX - rect.left) | 0;
		y = (e.clientY - rect.top) | 0;
		if(!frame) frame = requestAnimationFrame(paint);
	}, {passive:true});
	grid.addEventListener("pointerleave", drop, {passive:true});
	window.addEventListener("scroll", function(){ rect = null; }, {passive:true});
	window.addEventListener("resize", drop, {passive:true});
})();

(function () {
	var out = document.getElementById("last-commit");
	if (!out) return;
	var row = document.getElementById("fact-commit");
	var USER = "encrize";
	var KEY = "gh-last-commit-v2";
	var TTL = 15 * 60 * 1000;
	var COOL_KEY = "gh-last-commit-cooldown-v1";
	var COOL_TTL = 30 * 60 * 1000;

	function ago(iso) {
		var diff = Math.max(0, Date.now() - new Date(iso).getTime()) / 1000;
		var steps = [
			[60, "s", 1],
			[3600, "min", 60],
			[86400, "h", 3600],
			[2592000, "d", 86400],
			[31536000, "mo", 2592000]
		];
		if (diff < 60) return "just now";
		for (var i = 1; i < steps.length; i++) {
			if (diff < steps[i][0]) {
				return Math.floor(diff / steps[i][2]) + " " + steps[i][1] + " ago";
			}
		}
		return Math.floor(diff / 31536000) + " y ago";
	}

	function render(data) {
		out.textContent = ago(data.at);
		out.title = new Date(data.at).toLocaleString();
		if (data.repo) {
			var tag = document.createElement("span");
			tag.className = "repo";
			tag.textContent = "\u00b7 " + data.repo;
			out.parentNode.appendChild(tag);
		}
	}

	function fail() {
		if (row && row.parentNode) row.parentNode.removeChild(row);
	}

	function cool() {
		try { localStorage.setItem(COOL_KEY, String(Date.now() + COOL_TTL)); } catch (e) {}
	}
	function waiting() {
		try { return Date.now() < (Number(localStorage.getItem(COOL_KEY)) || 0); } catch (e) { return false; }
	}

	try {
		var hit = JSON.parse(localStorage.getItem(KEY) || "null");
		if (hit && Date.now() - hit.cachedAt < TTL) {
			render(hit);
			return;
		}
	} catch (e) {}

	if (waiting()) return fail();

	fetch("https://api.github.com/users/" + USER + "/events/public?per_page=50", {
		headers: { Accept: "application/vnd.github+json" }
	})
		.then(function (r) {
			if (!r.ok) throw new Error("github " + r.status);
			return r.json();
		})
		.then(function (events) {
			var push = null;
			for (var i = 0; i < events.length; i++) {
				if (events[i].type === "PushEvent") { push = events[i]; break; }
			}
			if (!push) throw new Error("no push events");
			var repo = (push.repo && push.repo.name ? push.repo.name : "").split("/").pop();
			var data = { at: push.created_at, repo: repo, cachedAt: Date.now() };
			try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
			render(data);
		})
		.catch(function () { cool(); fail(); });
})();

(function () {
	var roots = document.querySelectorAll("[data-shots]");

	Array.prototype.forEach.call(roots, function (root) {
		var track = root.querySelector("[data-shots-track]");
		if (!track) return;

		var slides = Array.prototype.slice.call(track.children);
		if (!slides.length) { root.style.display = "none"; return; }

		var caption = root.querySelector("[data-shots-caption]");
		var idxEl = root.querySelector("[data-shots-index]");
		var totalEl = root.querySelector("[data-shots-total]");
		var dotsBox = root.querySelector("[data-shots-dots]");
		var prevBtn = root.querySelector("[data-shots-prev]");
		var nextBtn = root.querySelector("[data-shots-next]");
		var i = 0;

		if (totalEl) totalEl.textContent = String(slides.length);

		var dots = slides.map(function (slide, n) {
			if (!dotsBox) return null;
			var b = document.createElement("button");
			b.type = "button";
			b.setAttribute("role", "tab");
			b.setAttribute("aria-label", slide.getAttribute("data-caption") || "Screenshot " + (n + 1));
			b.addEventListener("click", function () { go(n); });
			dotsBox.appendChild(b);
			return b;
		});

		function go(n) {
			i = (n + slides.length) % slides.length;
			track.style.transform = "translateX(" + (-i * 100) + "%)";
			if (caption) caption.textContent = slides[i].getAttribute("data-caption") || "";
			if (idxEl) idxEl.textContent = String(i + 1);
			dots.forEach(function (d, k) {
				if (d) d.setAttribute("aria-current", k === i ? "true" : "false");
			});
			slides.forEach(function (s, k) {
				s.setAttribute("aria-hidden", k === i ? "false" : "true");
			});
		}

		if (slides.length < 2) {
			if (prevBtn) prevBtn.style.display = "none";
			if (nextBtn) nextBtn.style.display = "none";
			if (dotsBox) dotsBox.style.display = "none";
		} else {
			if (prevBtn) prevBtn.addEventListener("click", function () { go(i - 1); });
			if (nextBtn) nextBtn.addEventListener("click", function () { go(i + 1); });
		}

		root.tabIndex = 0;
		root.addEventListener("keydown", function (e) {
			if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
			if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
		});

		var x0 = null;
		root.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
		root.addEventListener("touchend", function (e) {
			if (x0 === null) return;
			var dx = e.changedTouches[0].clientX - x0;
			if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
			x0 = null;
		}, { passive: true });

		root.addEventListener("click", function (e) { e.stopPropagation(); });

		go(0);
	});
})();

(function () {
	var API_URL = "/api/devices";
	var POLL_MS = 30000;
	var REQUEST_TIMEOUT_MS = 10000;
	var panel = document.getElementById("devices-panel");
	var list = document.getElementById("devices-list");
	var sync = document.getElementById("devices-sync");
	if (!panel || !list || !sync || !window.fetch) return;

	var rows = Object.create(null);
	var lastSuccess = 0;
	var hasData = false;
	var inFlight = false;

	function plainObject(value) {
		return value && typeof value === "object" && !Array.isArray(value);
	}

	function normalize(id, value) {
		if (!plainObject(value)) return null;
		var level = value.level;
		if (!(Number.isInteger(level) && level >= 0 && level <= 100)) level = null;
		return {
			device: id,
			displayName: typeof value.displayName === "string" && value.displayName.trim() ? value.displayName.trim() : id,
			level: level,
			charging: value.charging === true,
			lowPowerMode: value.lowPowerMode === true,
			wifi: typeof value.wifi === "string" && value.wifi.trim() ? value.wifi.trim() : null,
			accessories: Array.isArray(value.accessories) ? value.accessories.filter(function (tag) { return typeof tag === "string" && tag.trim(); }).map(function (tag) { return tag.trim(); }) : [],
			updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
		};
	}

	function when(iso) {
		var stamp = Date.parse(iso);
		if (!isFinite(stamp)) return "unknown";
		var seconds = Math.max(0, Math.floor((Date.now() - stamp) / 1000));
		if (seconds < 60) return "just now";
		var minutes = Math.floor(seconds / 60);
		if (minutes < 60) return minutes + "m ago";
		var hours = Math.floor(minutes / 60);
		if (hours < 24) return hours + "h ago";
		var days = Math.floor(hours / 24);
		if (days < 30) return days + "d ago";
		var months = Math.floor(days / 30);
		if (months < 12) return months + "mo ago";
		return Math.floor(months / 12) + "y ago";
	}

	function stateFor(level) {
		if (level === null) return "is-unknown";
		if (level > 50) return "is-good";
		if (level >= 20) return "is-mid";
		return "is-low";
	}

	function addTag(container, text, className) {
		var tag = document.createElement("span");
		tag.className = "device-tag" + (className ? " " + className : "");
		tag.textContent = text;
		container.appendChild(tag);
	}

	function makeRow(id) {
		var row = document.createElement("article");
		row.className = "device-card is-unknown";
		row.setAttribute("data-device-id", id);
		row.innerHTML =
			'<div class="device-identity">' +
				'<span aria-hidden="true" class="device-mark"></span>' +
				'<span><strong class="device-name"></strong><span class="device-id"></span></span>' +
			'</div>' +
			'<div class="device-battery">' +
				'<div class="device-battery-copy"><span>battery</span><span><strong class="device-percent">-</strong><span aria-label="charging" class="device-charge" hidden>↯</span></span></div>' +
				'<div class="device-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span class="device-progress-fill"></span></div>' +
			'</div>' +
			'<time class="device-time"></time>' +
			'<div class="device-tags"></div>';
		rows[id] = row;
		return row;
	}

	function updateRow(row, record, isNew) {
		var level = record.level;
		row.classList.remove("is-good", "is-mid", "is-low", "is-unknown");
		row.classList.add(stateFor(level));
		row.querySelector(".device-mark").textContent = record.displayName.slice(0, 1).toUpperCase();
		row.querySelector(".device-name").textContent = record.displayName;
		row.querySelector(".device-id").textContent = record.device;

		var percent = row.querySelector(".device-percent");
		percent.textContent = level === null ? "-" : level + "%";
		var charge = row.querySelector(".device-charge");
		charge.hidden = !record.charging;

		var progress = row.querySelector(".device-progress");
		progress.setAttribute("aria-label", record.displayName + " battery");
		if (level === null) {
			progress.removeAttribute("aria-valuenow");
			progress.setAttribute("aria-valuetext", "Battery level unknown");
		} else {
			progress.setAttribute("aria-valuenow", String(level));
			progress.setAttribute("aria-valuetext", level + " percent" + (record.charging ? ", charging" : ""));
		}
		var fill = row.querySelector(".device-progress-fill");
		var target = (level === null ? 0 : level) + "%";
		if (isNew) {
			fill.style.width = "0%";
			requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = target; }); });
		} else {
			fill.style.width = target;
		}

		var time = row.querySelector(".device-time");
		time.setAttribute("datetime", record.updatedAt || "");
		time.setAttribute("data-updated-at", record.updatedAt || "");
		time.textContent = when(record.updatedAt);

		var tags = row.querySelector(".device-tags");
		tags.textContent = "";
		if (record.charging) addTag(tags, "charging", "is-positive");
		if (record.lowPowerMode) addTag(tags, "low power", "is-attention");
		if (record.wifi) addTag(tags, record.wifi, "");
		record.accessories.forEach(function (accessory) { addTag(tags, accessory, ""); });
	}

	function setPanelState(state, message) {
		panel.setAttribute("data-state", state);
		sync.textContent = message;
	}

	function showMessage(title, detail) {
		Object.keys(rows).forEach(function (id) { delete rows[id]; });
		list.innerHTML = "";
		var empty = document.createElement("div");
		empty.className = "devices-empty";
		var box = document.createElement("div");
		var strong = document.createElement("b");
		strong.textContent = title;
		var copy = document.createElement("span");
		copy.textContent = detail;
		box.appendChild(strong);
		box.appendChild(copy);
		empty.appendChild(box);
		list.appendChild(empty);
	}

	function render(payload) {
		var records = Object.keys(payload).map(function (id) { return normalize(id, payload[id]); }).filter(Boolean);
		records.sort(function (a, b) {
			if (a.level === null && b.level !== null) return 1;
			if (a.level !== null && b.level === null) return -1;
			if (a.level !== b.level) return (b.level || 0) - (a.level || 0);
			return a.displayName.localeCompare(b.displayName);
		});

		var active = Object.create(null);
		if (!records.length) {
			hasData = false;
			showMessage("No devices yet", "The first authenticated report will appear here.");
			return;
		}

		if (!hasData) list.textContent = "";
		records.forEach(function (record) {
			active[record.device] = true;
			var isNew = !rows[record.device];
			var row = rows[record.device] || makeRow(record.device);
			updateRow(row, record, isNew);
			list.appendChild(row);
		});
		Object.keys(rows).forEach(function (id) {
			if (!active[id]) {
				rows[id].remove();
				delete rows[id];
			}
		});
		hasData = true;
	}

	function updateTimes() {
		var times = list.querySelectorAll(".device-time[data-updated-at]");
		for (var i = 0; i < times.length; i++) times[i].textContent = when(times[i].getAttribute("data-updated-at"));
		if (lastSuccess && panel.getAttribute("data-state") === "online") sync.textContent = "synced " + when(new Date(lastSuccess).toISOString());
	}

	function loadDevices() {
		if (inFlight || document.hidden) return;
		inFlight = true;
		var controller = typeof AbortController === "function" ? new AbortController() : null;
		var timeout = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : 0;
		fetch(API_URL, {
			cache: "no-store",
			headers: { "Accept": "application/json" },
			signal: controller ? controller.signal : undefined
		})
			.then(function (response) {
				if (!response.ok) throw new Error("devices " + response.status);
				return response.json();
			})
			.then(function (payload) {
				if (!plainObject(payload)) throw new Error("invalid devices response");
				render(payload);
				lastSuccess = Date.now();
				panel.setAttribute("aria-busy", "false");
				setPanelState("online", "synced just now");
			})
			.catch(function () {
				panel.setAttribute("aria-busy", "false");
				setPanelState("retrying", "reconnecting…");
				if (!lastSuccess) showMessage("Telemetry unavailable", "Retrying quietly in the background.");
			})
			.then(function () {
				if (timeout) clearTimeout(timeout);
				inFlight = false;
			});
	}

	loadDevices();
	setInterval(loadDevices, POLL_MS);
	setInterval(updateTimes, 30000);
	window.addEventListener("online", loadDevices);
	document.addEventListener("visibilitychange", function () { if (!document.hidden) loadDevices(); });
})();


(function () {
	var API_URL = "/api/music";
	var LISTENBRAINZ_USER = "encrize";
	var CACHE_KEY = "last-listened-v1";
	var CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
	var REQUEST_TIMEOUT_MS = 10000;
	var card = document.getElementById("music-card");
	var cover = document.getElementById("music-cover");
	var title = document.getElementById("music-title");
	var artist = document.getElementById("music-artist");
	var time = document.getElementById("music-time");
	if (!card || !cover || !title || !artist || !time || !window.fetch) return;

	var playedAt = "";

	function relative(iso) {
		var stamp = Date.parse(iso);
		if (!isFinite(stamp)) return "";
		var seconds = Math.max(0, Math.floor((Date.now() - stamp) / 1000));
		if (seconds < 60) return "just now";
		var minutes = Math.floor(seconds / 60);
		if (minutes < 60) return minutes + "m ago";
		var hours = Math.floor(minutes / 60);
		if (hours < 24) return hours + "h ago";
		var days = Math.floor(hours / 24);
		if (days < 30) return days + "d ago";
		return new Date(stamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
	}

	function valid(data) {
		return data && typeof data.title === "string" && data.title.trim() &&
			typeof data.artist === "string" && data.artist.trim() &&
			typeof data.playedAt === "string" && isFinite(Date.parse(data.playedAt));
	}

	function youtubeUrl(track, performer) {
		return "https:" + "//www.youtube.com/results?search_query=" + encodeURIComponent(track + " " + performer);
	}

	function listenBrainzUrl() {
		return "https:" + "//api.listenbrainz.org/1/user/" + encodeURIComponent(LISTENBRAINZ_USER) + "/listens?count=1";
	}

	function itunesUrl(track, performer) {
		return "https:" + "//itunes.apple.com/search?entity=song&limit=1&term=" + encodeURIComponent(track + " " + performer);
	}

	function normalizeListenBrainz(payload) {
		var listens = payload && payload.payload && payload.payload.listens;
		var listen = Array.isArray(listens) ? listens[0] : null;
		var metadata = listen && listen.track_metadata;
		if (!metadata) return null;
		var additional = metadata.additional_info || {};
		var mapping = metadata.mbid_mapping || {};
		var release = additional.release_mbid || mapping.caa_release_mbid || mapping.release_mbid || "";
		return {
			title: metadata.track_name,
			artist: metadata.artist_name,
			playedAt: Number(listen.listened_at) > 0 ? new Date(Number(listen.listened_at) * 1000).toISOString() : "",
			coverUrl: /^[0-9a-f-]{36}$/i.test(release) ? "https:" + "//coverartarchive.org/release/" + release + "/front-250" : null
		};
	}

	function render(data) {
		if (!valid(data)) return false;
		playedAt = data.playedAt;
		title.textContent = data.title.trim();
		artist.textContent = data.artist.trim();
		title.href = youtubeUrl(data.title.trim(), data.artist.trim());
		title.setAttribute("aria-label", "Search YouTube for " + data.title.trim() + " by " + data.artist.trim());
		time.dateTime = playedAt;
		time.textContent = relative(playedAt);
		card.classList.remove("is-loading", "is-error", "has-cover");
		card.setAttribute("aria-busy", "false");

		cover.removeAttribute("src");
		if (typeof data.coverUrl === "string" && /^https:\/\//.test(data.coverUrl)) {
			cover.onload = function () { card.classList.add("has-cover"); };
			cover.onerror = function () { card.classList.remove("has-cover"); cover.removeAttribute("src"); };
			cover.src = data.coverUrl;
		}
		return true;
	}

	function readCache() {
		try {
			var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
			if (!cached || Date.now() - cached.savedAt > CACHE_TTL || !valid(cached.data)) return null;
			return cached.data;
		} catch (e) { return null; }
	}

	function saveCache(data) {
		try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: data })); } catch (e) {}
	}

	var cached = readCache();
	if (cached) render(cached);

	function requestJson(url) {
		var controller = typeof AbortController === "function" ? new AbortController() : null;
		var timeout = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : 0;
		return fetch(url, {
			cache: "no-store",
			headers: { "Accept": "application/json" },
			signal: controller ? controller.signal : undefined
		}).then(function (response) {
			if (!response.ok) throw new Error("music " + response.status);
			return response.json();
		}).then(function (data) {
			if (timeout) clearTimeout(timeout);
			return data;
		}, function (error) {
			if (timeout) clearTimeout(timeout);
			throw error;
		});
	}

	function enrichCover(data) {
		if (!valid(data)) return Promise.resolve(data);
		return requestJson(itunesUrl(data.title, data.artist)).then(function (result) {
			var item = result && Array.isArray(result.results) ? result.results[0] : null;
			var artwork = item && typeof item.artworkUrl100 === "string" ? item.artworkUrl100 : "";
			if (/^https:\/\/[^/]+\.mzstatic\.com\//i.test(artwork)) {
				data.coverUrl = artwork.replace(/\/100x100bb\./, "/300x300bb.");
			}
			return data;
		}).catch(function () { return data; });
	}

	function showUnavailable() {
		if (cached) return;
		card.classList.remove("is-loading", "has-cover");
		card.classList.add("is-error");
		card.setAttribute("aria-busy", "false");
		card.setAttribute("aria-label", "Music status unavailable");
		title.textContent = "Music status unavailable";
		title.removeAttribute("href");
		title.removeAttribute("target");
		artist.textContent = "check ListenBrainz sync";
		time.textContent = "";
	}

	requestJson(API_URL)
		.catch(function () {
			return requestJson(listenBrainzUrl()).then(normalizeListenBrainz);
		})
		.then(enrichCover)
		.then(function (data) {
			if (!render(data)) throw new Error("invalid music response");
			saveCache(data);
		})
		.catch(showUnavailable);

	setInterval(function () { if (playedAt) time.textContent = relative(playedAt); }, 60000);
})();
