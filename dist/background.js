// src/shared/popup-layout.ts
var e = "kosmore.popup.";
function t(e) {
	if (!e || typeof e != "object") return null;
	let t = e;
	return [t.left, t.top].every((e) => typeof e == "number" && Number.isFinite(e) && e >= 0 && e <= 1e5) ? {
		left: Math.round(t.left),
		top: Math.round(t.top)
	} : null;
}
function n(e) {
	if (!e || typeof e != "object") return {
		pinned: !1,
		position: null
	};
	let n = e;
	return {
		pinned: n.pinned === !0,
		position: t(n.position)
	};
}
function r(e) {
	if (!e || typeof e != "object" || Array.isArray(e)) return !1;
	let n = e;
	return Object.keys(n).every((e) => [
		"pinned",
		"position",
		"width",
		"height"
	].includes(e)) && (n.pinned === void 0 || typeof n.pinned == "boolean") && (n.position === void 0 || t(n.position) !== null) && (n.width === void 0 || Number.isFinite(n.width) && n.width >= 320 && n.width <= 1200) && (n.height === void 0 || Number.isFinite(n.height) && n.height >= 480 && n.height <= 1600);
}
// src/shared/messages.ts
var i = (e) => typeof e == "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(e);
function a(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return i(t.requestId) && ([
		"sessions",
		"openOptions",
		"popupState"
	].includes(t.op) || t.op === "popupLayout" && r(t.change) || t.op === "albums" && Number.isInteger(t.tabId) && t.tabId >= 0 && /^[a-z0-9_]{1,24}$/.test(t.accountKey));
}
// src/shared/types.ts
function o(e) {
	return e instanceof Error ? e.message : "The request failed. Please try again.";
}
// src/shared/stat-catalog.ts
var s = [
	{
		id: "minPrice",
		label: "Min Price",
		description: "Lowest completed-sale price for the selected variants.",
		source: "prices",
		preview: { value: "12" },
		read: (e) => ({
			value: e.prices.min ?? "—",
			title: e.priceNotice
		})
	},
	{
		id: "medianPrice",
		label: "Median Price",
		description: "Median completed-sale price for the selected variants.",
		source: "prices",
		preview: { value: "18" },
		read: (e) => ({
			value: e.prices.median ?? "—",
			title: e.priceNotice
		})
	},
	{
		id: "maxPrice",
		label: "Max Price",
		description: "Highest completed-sale price for the selected variants.",
		source: "prices",
		preview: { value: "24" },
		read: (e) => ({
			value: e.prices.max ?? "—",
			title: e.priceNotice
		})
	},
	{
		id: "interest",
		label: "Kosmora interest",
		description: "Number of players interested in the card.",
		source: "card",
		preview: { value: "18" },
		read: (e) => ({
			value: e.card?.interested?.toLocaleString() ?? "—",
			title: e.cardError ?? "Players interested in this card"
		})
	},
	{
		id: "readership",
		label: "Wikipedia · recorded median/day",
		description: "Kosmora’s recorded median daily Wikipedia views.",
		source: "card",
		preview: { value: "1,240" },
		read: (e) => ({
			value: e.card?.readership?.toLocaleString() ?? "—",
			title: e.cardError ?? `Kosmora’s recorded median daily Wikipedia views. ${e.card?.readershipSource ?? ""}`
		})
	},
	{
		id: "salesCount",
		label: "Sales · 30 days",
		description: "Completed-sale count across the selected variants.",
		source: "sales",
		preview: { value: "9" },
		read: (e) => ({
			value: e.saleCount === null ? "—" : `${e.saleCount.toLocaleString()}${e.complete ? "" : "+"}`,
			title: e.complete ? "Completed sales across the selected market finish groups." : "Incomplete while one or more finish groups are unavailable."
		})
	}
], c = () => s.map(({ id: e }) => ({
	id: e,
	enabled: !0
}));
function l(e) {
	if (!Array.isArray(e)) return c();
	let t = new Map(s.map((e) => [e.id, e])), n = /* @__PURE__ */ new Set(), r = [];
	for (let i of e) {
		if (!i || typeof i != "object") continue;
		let { id: e, enabled: a } = i;
		e && t.has(e) && !n.has(e) && (n.add(e), r.push({
			id: e,
			enabled: typeof a != "boolean" || a
		}));
	}
	return [...r, ...c().filter((e) => !n.has(e.id))];
}
// src/shared/hotkeys.ts
var u = [
	{
		id: "home",
		label: "Home",
		path: "/home"
	},
	{
		id: "collection",
		label: "Collection",
		path: "/collection"
	},
	{
		id: "albums",
		label: "Albums",
		path: "/albums"
	},
	{
		id: "atlas",
		label: "Atlas",
		path: "/atlas"
	},
	{
		id: "social",
		label: "Social",
		path: "/social"
	},
	{
		id: "marketBuy",
		label: "Market Buy",
		path: "/market"
	},
	{
		id: "marketAuctions",
		label: "Market Activity My Auctions",
		path: "/market?tab=overview&view=auctions"
	},
	{
		id: "marketActivity",
		label: "Market Activity My Activity",
		path: "/market?tab=overview&view=mine"
	},
	{
		id: "marketAlerts",
		label: "Market Alerts",
		path: "/market#kosmore-alerts"
	},
	{
		id: "talents",
		label: "Talents",
		path: "/talents"
	},
	{
		id: "packs",
		label: "Packs",
		path: "/packs"
	},
	{
		id: "pulsar",
		label: "Pulsar",
		path: "/games"
	},
	{
		id: "odyssey",
		label: "Odyssey",
		path: "/odyssey"
	},
	{
		id: "profile",
		label: "My Profile",
		path: null
	}
];
function d(e) {
	return `${e.ctrl}-${e.alt}-${e.shift}-${e.meta}-${e.code}`;
}
function f(e) {
	let t = {}, n = /* @__PURE__ */ new Set();
	if (!e || typeof e != "object") return t;
	let r = e;
	for (let e of u) {
		let i = r[e.id];
		if (!i || typeof i != "object") continue;
		let a = i;
		if (typeof a.code != "string" || !/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(a.code) || ![
			a.ctrl,
			a.alt,
			a.shift,
			a.meta
		].every((e) => typeof e == "boolean")) continue;
		let o = {
			code: a.code,
			ctrl: a.ctrl,
			alt: a.alt,
			shift: a.shift,
			meta: a.meta
		}, s = d(o);
		n.has(s) || (n.add(s), t[e.id] = o);
	}
	return t;
}
// src/shared/settings.ts
var p = "kosmore.settings", m = () => ({
	schemaVersion: 1,
	enabled: !0,
	hoverDelayMs: 300,
	dismissDelayMs: 200,
	popupWidth: 440,
	popupHeight: 900,
	popupPosition: null,
	showSaleHistoryOverlay: !0,
	showFriendInterestOverlay: !0,
	showQuestOverlay: !0,
	stats: c(),
	hotkeys: {},
	pinnedAlbums: {}
});
function h(e) {
	let n = m();
	if (!e || typeof e != "object") return n;
	let r = e;
	if (r.schemaVersion !== 1) return n;
	n.stats = l(r.stats), n.hotkeys = f(r.hotkeys), n.popupPosition = t(r.popupPosition), typeof r.enabled == "boolean" && (n.enabled = r.enabled), typeof r.showSaleHistoryOverlay == "boolean" && (n.showSaleHistoryOverlay = r.showSaleHistoryOverlay), typeof r.showFriendInterestOverlay == "boolean" && (n.showFriendInterestOverlay = r.showFriendInterestOverlay), typeof r.showQuestOverlay == "boolean" && (n.showQuestOverlay = r.showQuestOverlay), typeof r.hoverDelayMs == "number" && Number.isFinite(r.hoverDelayMs) && (n.hoverDelayMs = Math.min(2e3, Math.max(100, Math.round(r.hoverDelayMs))));
	for (let [e, t, i] of [
		[
			"dismissDelayMs",
			0,
			3e4
		],
		[
			"popupWidth",
			320,
			1200
		],
		[
			"popupHeight",
			480,
			1600
		]
	]) {
		let a = r[e];
		typeof a == "number" && Number.isFinite(a) && (n[e] = Math.min(i, Math.max(t, Math.round(a))));
	}
	if (r.pinnedAlbums && typeof r.pinnedAlbums == "object") for (let [e, t] of Object.entries(r.pinnedAlbums)) /^[a-z0-9_]{1,24}$/.test(e) && Array.isArray(t) && (n.pinnedAlbums[e] = [...new Set(t.filter((e) => typeof e == "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(e)))].slice(0, 200));
	return n;
}
async function g() {
	return h((await chrome.storage.local.get(p))[p]);
}
async function _(e) {
	await chrome.storage.local.set({ [p]: h(e) });
}
// src/background.ts
var v = Promise.resolve();
chrome.tabs.onRemoved.addListener((t) => {
	chrome.storage.session.remove(`${e}${t}`);
}), chrome.action.onClicked.addListener(() => {
	chrome.runtime.openOptionsPage();
}), chrome.runtime.onMessage.addListener((r, i, s) => {
	if (i.id !== chrome.runtime.id || !a(r)) return !1;
	let c = i.url === chrome.runtime.getURL("options.html"), l = !!i.tab && i.url?.startsWith("https://kosmora.io/");
	if ((r.op === "popupState" || r.op === "popupLayout") && l && i.tab?.id !== void 0 && i.frameId === 0) {
		let a = `${e}${i.tab.id}`, c = v.then(async () => {
			let e = n((await chrome.storage.session.get(a))[a]);
			if (r.op === "popupState") return e;
			let i = r.change;
			if (i.pinned !== void 0 && (e.pinned = i.pinned), i.position && (e.position = t(i.position)), await chrome.storage.session.set({ [a]: e }), i.position || i.width !== void 0 || i.height !== void 0) {
				let e = await g();
				i.position && (e.popupPosition = t(i.position)), i.width !== void 0 && (e.popupWidth = Math.round(i.width)), i.height !== void 0 && (e.popupHeight = Math.round(i.height)), await _(e);
			}
			return e;
		});
		return v = c.then(() => {}, () => {}), c.then((e) => s({
			requestId: r.requestId,
			ok: !0,
			data: e
		}), (e) => s({
			requestId: r.requestId,
			ok: !1,
			error: o(e)
		})), !0;
	}
	return r.op === "openOptions" && l ? (chrome.runtime.openOptionsPage().then(() => s({
		requestId: r.requestId,
		ok: !0,
		data: null
	})), !0) : c ? ((async () => {
		if (r.op === "sessions") {
			let e = await chrome.tabs.query({ url: "https://kosmora.io/*" });
			return (await Promise.allSettled(e.filter((e) => e.id !== void 0).map(async (e) => {
				let t = await chrome.tabs.sendMessage(e.id, {
					requestId: r.requestId,
					op: "session"
				});
				if (!t?.ok || t.requestId !== r.requestId) throw Error("Game tab unavailable.");
				return {
					tabId: e.id,
					account: t.data
				};
			}))).flatMap((e) => e.status === "fulfilled" ? [e.value] : []);
		}
		if (r.op === "albums") {
			if (!(await chrome.tabs.get(r.tabId)).url?.startsWith("https://kosmora.io/")) throw Error("Choose a Kosmora tab.");
			let e = await chrome.tabs.sendMessage(r.tabId, {
				requestId: r.requestId,
				op: "listAlbums",
				accountKey: r.accountKey
			});
			if (!e?.ok || e.requestId !== r.requestId) throw Error(e && !e.ok ? e.error : "The game tab is unavailable.");
			return e.data;
		}
		throw Error("Unsupported request.");
	})().then((e) => s({
		requestId: r.requestId,
		ok: !0,
		data: e
	}), (e) => s({
		requestId: r.requestId,
		ok: !1,
		error: o(e)
	})), !0) : !1;
});

//# sourceMappingURL=background.js.map