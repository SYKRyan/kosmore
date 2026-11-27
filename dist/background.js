// src/kosmora/contracts.ts
function e(e) {
	if (!e || typeof e != "object" || Array.isArray(e)) throw Error("Kosmora returned an unfamiliar response.");
	return e;
}
function t(e) {
	if (typeof e != "string") throw Error("Kosmora returned an unfamiliar text value.");
	return e;
}
function n(e) {
	if (typeof e != "number" || !Number.isSafeInteger(e) || e < 0) throw Error("Kosmora returned an unfamiliar count.");
	return e;
}
function r(e) {
	let n = t(e);
	if (!/^\d{1,18}$/.test(n)) throw Error("Invalid card identifier.");
	return BigInt(n).toString();
}
function i(e) {
	let n = t(e);
	if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(n)) throw Error("Invalid copy or album identifier.");
	return n;
}
function a(e) {
	let n = t(e);
	if (!/^\d+$/.test(n)) throw Error("Invalid market price.");
	return n;
}
function o(e) {
	let n = t(e);
	if (!Number.isFinite(Date.parse(n))) throw Error("Invalid sale date.");
	return n;
}
// src/shared/types.ts
var s = [
	"plain",
	"veil",
	"fullart"
], c = {
	plain: "Standard",
	veil: "Shiny",
	fullart: "Full art"
};
function l(e) {
	return e instanceof Error ? e.message : "The request failed. Please try again.";
}
// src/shared/sale-observations.ts
var u = (e, t) => ({
	sold: e,
	total: t,
	percent: t ? Math.round(e / t * 100) : null
});
function d(e, t) {
	let n = 0, r = 0;
	for (let i of t) n += e[i].sold, r += e[i].total;
	return u(n, r);
}
// src/kosmora/my-listings.ts
var f = [
	"selling",
	"sold",
	"unsold"
], p = () => ({
	selling: 50,
	sold: 50,
	unsold: 50
});
function m(e) {
	if (typeof e == "string") try {
		return i(e).toLowerCase();
	} catch {
		return;
	}
}
var h = (e) => /^cancel/i.test(e ?? "");
function g(e) {
	if (e === "expired" || h(e)) return "unsold";
	if (e === "sold") return "sold";
	if (e === "open") return "selling";
}
function _(e) {
	let { state: t, endsAt: n } = e;
	if (typeof t != "string" || typeof n != "string" || !Number.isFinite(Date.parse(n))) return;
	let r = g(t);
	if (r) return {
		group: r,
		state: t,
		endsAt: n
	};
}
function v(e) {
	if (!e || typeof e != "object") return !1;
	let { copyId: t, outcome: n } = e;
	return (t !== void 0 || n !== void 0) && (t === void 0 || typeof t == "string" && m(t) === t) && (n === void 0 || !!n && typeof n == "object" && _({
		state: n.state,
		endsAt: n.endsAt
	})?.group === n.group && f.includes(n.group));
}
function y(e, t) {
	let n = t.copyId ?? e.copyId, r = e.group ?? g(e.state), i = r === "sold" || r === "unsold" ? void 0 : t.outcome;
	return n === e.copyId && (!i || e.group === i.group && e.state === i.state && e.endsAt === i.endsAt) ? e : i ? {
		...e,
		copyId: n,
		group: i.group,
		state: i.state,
		endsAt: i.endsAt
	} : {
		...e,
		copyId: n
	};
}
function b(n) {
	try {
		let s = e(n);
		return i(s.id), r(s.subjectId), o(s.endsAt), a(s.startPrice), t(s.state), f.includes(s.group) && (s.copyId === void 0 || m(s.copyId) === s.copyId) && [
			"plain",
			"veil",
			"fullart"
		].includes(String(s.finish));
	} catch {
		return !1;
	}
}
function x(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return S(t.limits) && Array.isArray(t.listings) && t.listings.every(b) && [t.totals, t.counts].every((e) => e && f.every((t) => Number.isSafeInteger(e[t]) && e[t] >= 0)) && (t.startedAt === void 0 || Number.isFinite(t.startedAt) && t.startedAt >= 0) && Number.isFinite(t.fetchedAt) && t.fetchedAt >= 0;
}
function S(e) {
	return !e || typeof e != "object" ? !1 : f.every((t) => {
		let n = e[t];
		return Number.isInteger(n) && n >= 1 && n <= 1e6;
	});
}
var C = (e) => f.every((t) => e.counts[t] >= e.totals[t]);
function w(e, t = f) {
	let n = { ...e.limits };
	for (let r of t) if (e.counts[r] < e.totals[r] && (n[r] = Math.min(e.totals[r], Math.max(n[r] * 2, 50)), n[r] <= e.limits[r])) throw Error("Your listing history stopped before all auctions were returned.");
	return n;
}
// src/kosmora/listing-capture.ts
function T(t) {
	try {
		let n = e(t);
		return i(n.auctionId), typeof n.submittedAt == "number" && Number.isSafeInteger(n.submittedAt) && n.submittedAt > 0 && (n.startPrice === void 0 || a(n.startPrice) === n.startPrice) && (n.copyId === void 0 || m(n.copyId) === n.copyId);
	} catch {
		return !1;
	}
}
function E(t) {
	try {
		let n = e(t);
		return i(n.id) === n.id && (n.finish === void 0 || [
			"plain",
			"veil",
			"fullart"
		].includes(String(n.finish))) && r(n.subjectId) === n.subjectId && a(n.startPrice) === n.startPrice && (n.copyId === void 0 || m(n.copyId) === n.copyId) && typeof n.submittedAt == "number" && Number.isSafeInteger(n.submittedAt) && n.submittedAt > 0;
	} catch {
		return !1;
	}
}
// src/shared/popup-layout.ts
var D = [
	"market",
	"history",
	"trade",
	"notes"
];
function O(e) {
	return D.some((t) => t === e);
}
var k = "kosmore.popup.", A = "kosmore.popupPin", j = "kosmore.friendPopup.";
function M(e) {
	if (!e || typeof e != "object") return null;
	let t = e;
	return [t.left, t.top].every((e) => typeof e == "number" && Number.isFinite(e) && e >= 0 && e <= 1e5) ? {
		left: Math.round(t.left),
		top: Math.round(t.top)
	} : null;
}
function N(e) {
	if (!e || typeof e != "object") return {
		pinned: !1,
		position: null
	};
	let t = e;
	return {
		pinned: t.pinned === !0,
		position: M(t.position),
		...O(t.tab) ? { tab: t.tab } : {}
	};
}
function ee(e, t = {
	minWidth: 320,
	minHeight: 480
}) {
	if (!e || typeof e != "object" || Array.isArray(e)) return !1;
	let n = e;
	return Object.keys(n).every((e) => [
		"pinned",
		"position",
		"width",
		"height",
		"tab"
	].includes(e)) && (n.tab === void 0 || O(n.tab)) && (n.pinned === void 0 || typeof n.pinned == "boolean") && (n.position === void 0 || M(n.position) !== null) && (n.width === void 0 || Number.isFinite(n.width) && n.width >= t.minWidth && n.width <= 1200) && (n.height === void 0 || Number.isFinite(n.height) && n.height >= t.minHeight && n.height <= 1600);
}
// src/shared/services.ts
var te = "kosmore.servicesConnectionChanged", P = (e) => typeof e == "string" && /^[1-9]\d{0,17}$/.test(e);
function F(e) {
	let t = new URL(e.trim());
	if (t.protocol !== "https:" && !(t.protocol === "http:" && ["localhost", "127.0.0.1"].includes(t.hostname)) || t.username || t.password || t.search || t.hash || /[?#]/.test(e) || ["kosmora.io", "developers.kosmora.io"].includes(t.hostname)) throw Error("Use HTTPS, or use HTTP with localhost or 127.0.0.1 for local testing.");
	return t.origin + t.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
}
function ne(e) {
	let { protocol: t, hostname: n } = new URL(e);
	return `${t}//${n}/*`;
}
function I(e) {
	if (e === "shiny") return "veil";
	if (e === "plain" || e === "fullart") return e;
	throw Error("Invalid card finish.");
}
function re(r, i) {
	let s = e(r), c = e(s.card);
	if (c.id !== i) throw Error("Card ID mismatch.");
	let l = {};
	for (let t of [
		"plain",
		"shiny",
		"fullart"
	]) {
		let r = I(t), i = e(e(s.sales)[t]), c = e(i.last30Days), u = i.lastSale === null ? void 0 : e(i.lastSale), d = e(s.history)[t];
		if (!Array.isArray(d)) throw Error("Daily history unavailable.");
		l[r] = {
			finish: r,
			days: 30,
			count: n(c.count),
			complete: !1,
			sales: [],
			low: i.low === null ? null : a(i.low),
			median: c.median === null ? null : a(c.median),
			high: i.high === null ? null : a(i.high),
			...u && { lastSale: {
				price: a(u.price),
				soldAt: o(u.at),
				finish: r,
				numberOne: u.numberOne === !0
			} },
			daily: d.map((t) => {
				let r = e(t);
				if (typeof r.day != "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) throw Error("Invalid sales day.");
				return {
					day: r.day,
					count: n(r.count),
					low: a(r.low),
					median: a(r.median),
					high: a(r.high)
				};
			})
		};
	}
	if (!Array.isArray(c.families) || !Array.isArray(c.quests) || !Array.isArray(s.auctions)) throw Error("Invalid card details.");
	return {
		id: i,
		name: t(c.name),
		rarity: t(c.rarity),
		families: c.families.map((n) => {
			let r = e(n);
			return {
				id: t(r.id),
				name: t(r.name)
			};
		}),
		quests: c.quests.map((n) => t(e(n).id)),
		auctions: s.auctions.map((t) => {
			let n = e(t);
			return {
				finish: I(n.finish),
				price: a(n.price),
				...typeof n.bids == "number" && Number.isSafeInteger(n.bids) && n.bids >= 0 && { bids: n.bids },
				endsAt: o(n.endsAt)
			};
		}),
		markets: l
	};
}
function ie(t, n) {
	if (!Array.isArray(t)) throw Error("Open listings unavailable.");
	return t.map((t) => {
		let r = e(t);
		if (e(r.card).id !== n || typeof r.id != "string" || !/^[0-9a-f]{24}$/.test(r.id)) throw Error("Invalid listing.");
		return {
			id: r.id,
			finish: I(r.finish),
			startPrice: a(r.startPrice),
			...typeof r.price == "string" && /^\d+$/.test(r.price) && { price: r.price },
			...typeof r.bids == "number" && Number.isSafeInteger(r.bids) && r.bids >= 0 && { bids: r.bids },
			endsAt: o(r.endsAt)
		};
	});
}
// src/shared/sale-status.ts
var ae = (e) => e === "plain" || e === "veil" || e === "fullart", oe = (e) => "kosmore.saleStatus." + e, L = 864e5;
function R(e) {
	return !!e && typeof e.auctionId == "string" && m(e.auctionId) === e.auctionId && (e.subjectId === void 0 || P(e.subjectId)) && (e.finish === void 0 || ae(e.finish)) && (e.startPrice === void 0 || e.kind === "listed" && typeof e.startPrice == "string" && /^\d+$/.test(e.startPrice)) && (e.copyId === void 0 || m(e.copyId) === e.copyId) && (e.relistOf === void 0 || m(e.relistOf) === e.relistOf) && (e.kind === "listed" || e.kind === "canceled") && Number.isSafeInteger(e.at) && e.at > 0 && e.at <= Date.now();
}
function z(e, t, n, r = Date.now()) {
	let i = { ...e };
	for (let { auctionId: e, subjectId: n, copyId: r, relistOf: a, kind: o, at: s, finish: c, startPrice: l } of t) {
		let t = i[e];
		i[e] = {
			...t,
			subjectId: t?.subjectId ?? n,
			...c && { finish: c },
			...l !== void 0 && o === "listed" && { startPrice: l },
			...r && { copyId: r },
			...a && { relistOf: a },
			[o]: Math.min(t?.[o] ?? s, s)
		};
	}
	let a = new Map(Object.entries(i));
	for (let e of n) {
		let t = e.id.toLowerCase();
		a.set(t, {
			...a.get(t),
			...e
		});
	}
	let o = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map();
	for (let e of a.values()) e.copyId && e.finish && s.set(e.copyId, e.finish);
	for (let { copyId: e, subjectId: t } of a.values()) e && t && o.set(e, t);
	for (let [e, t] of Object.entries(i)) {
		let n = a.get(e), r = t.relistOf ? a.get(t.relistOf) : void 0, c = t.copyId ?? n?.copyId ?? r?.copyId, l = t.subjectId ?? n?.subjectId ?? r?.subjectId ?? (c && o.get(c)), u = t.finish ?? n?.finish ?? r?.finish ?? (c ? s.get(c) : void 0), d = t.startPrice ?? n?.startPrice;
		(l !== t.subjectId || c !== t.copyId || u !== t.finish || d !== t.startPrice) && (i[e] = {
			...t,
			subjectId: l,
			copyId: c,
			...u && { finish: u },
			...d !== void 0 && { startPrice: d }
		}, a.set(e, i[e]), l && c && o.set(c, l));
	}
	for (let [e, t] of Object.entries(i)) Math.max(t.listed ?? 0, t.canceled ?? 0) <= r - L && delete i[e];
	return i;
}
// src/shared/messages.ts
var B = (e) => typeof e == "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(e);
function V(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return B(t.requestId) && (t.op === "listingCopiesObserved" && /^[a-z0-9_]{1,24}$/.test(t.accountKey) && /^[1-9]\d{0,17}$/.test(t.subjectId) && t.copies && Number.isSafeInteger(t.copies.at) && t.copies.at > 0 && t.copies.at <= Date.now() && (t.copies.finishes === void 0 || t.copies.finishes !== null && typeof t.copies.finishes == "object" && Object.entries(t.copies.finishes).every(([e, t]) => m(e) === e && ae(t))) && Array.isArray(t.copies.auctionIds) && t.copies.auctionIds.every((e) => typeof e == "string" && m(e) === e) || t.op === "listingObserved" && /^[a-z0-9_]{1,24}$/.test(t.accountKey) && t.subjectId === "0" && Array.isArray(t.rows) && (t.saveHistory === void 0 || typeof t.saveHistory == "boolean") && t.rows.length <= 500 && t.rows.every(b) || [
		"listingCache",
		"listingSavedPrice",
		"listingAccountVerified",
		"listingInvalidate",
		"listingHistory",
		"listingRecord",
		"listingMetadata"
	].includes(t.op) && "accountKey" in t && "subjectId" in t && /^[a-z0-9_]{1,24}$/.test(t.accountKey) && typeof t.subjectId == "string" && /^\d+$/.test(t.subjectId) && (t.op !== "listingRecord" || Array.isArray(t.records) && t.records.length <= 500 && t.records.every(E) && (t.changes === void 0 || Array.isArray(t.changes) && t.changes.length <= 500 && t.changes.every(R)) && (t.receipts === void 0 || Array.isArray(t.receipts) && t.receipts.length <= 500 && t.receipts.every(T))) && (t.op !== "listingMetadata" || Array.isArray(t.metadata) && t.metadata.length <= 100 && t.metadata.every((e) => Array.isArray(e) && e.length === 2 && typeof e[0] == "string" && m(e[0]) === e[0] && v(e[1]))) && (t.op !== "listingHistory" || ["more", "refresh"].includes(t.mode) && (t.limits === void 0 || S(t.limits))) || t.op === "listingCancel" && B(t.target) || t.op === "openOptions" && (t.section === void 0 || t.section === "stat-boxes") || [
		"sessions",
		"popupState",
		"friendPopupState",
		"browserZoom"
	].includes(t.op) || t.op === "popupLayout" && ee(t.change) || t.op === "friendPopupLayout" && ee(t.change, {
		minWidth: 240,
		minHeight: 160
	}) || (t.op === "albums" || t.op === "families") && Number.isInteger(t.tabId) && t.tabId >= 0 && /^[a-z0-9_]{1,24}$/.test(t.accountKey));
}
// src/shared/stat-catalog.ts
var H = [
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
		id: "salesCount",
		label: "Sales · 30 days",
		description: "Completed-sale count across the selected variants.",
		source: "sales",
		preview: { value: "9" },
		read: (e) => ({
			value: e.saleCount === null ? "—" : `${e.saleCount.toLocaleString()}${e.complete ? "" : "+"}`,
			title: e.complete ? "Completed sales across the selected market finish groups." : "Incomplete while one or more finish groups are unavailable."
		})
	},
	{
		id: "activeAuctions",
		label: "Active Auctions",
		description: "Open, unexpired market listings matching this card and finish.",
		source: "auctions",
		preview: { value: "7" },
		read: (e) => ({
			value: typeof e.activeAuctions == "number" ? e.activeAuctions.toLocaleString() : "—",
			title: e.activeAuctions instanceof Error ? e.activeAuctions.message : typeof e.activeAuctions == "number" ? "Active listings matching this card and finish. Counts are cached for up to 30 seconds; Refresh checks again." : e.cardError ?? "Loading active auctions…"
		})
	},
	{
		id: "saleRate",
		label: "Sale Rate · 30 days",
		description: "Estimated share sold for the selected finishes. Uses 30 days of locally cached sales and auction history, including stale data. The estimate divides sales by sales plus known unsold and still-open listings. Enabling it makes no additional requests.",
		source: "observed",
		preview: { value: "67% · 3" },
		read: (e) => se(e)
	}
];
function se(e) {
	if (!e.saleRates) return {
		value: "—",
		title: "Loading card details…"
	};
	let t = d(e.saleRates, e.finishes), n = `${s.filter((t) => e.finishes.includes(t)).map((t) => {
		let n = e.saleRates[t];
		return `${c[t]}: ${n.total ? `${n.sold} of ${n.total} sold` : "none observed"}`;
	}).join(" · ")}. Estimated from locally cached sales, unsold outcomes and open auctions over 30 days. Cached snapshots may be stale.`;
	return t.percent === null ? {
		value: "—",
		title: n
	} : {
		value: `${t.percent}% · ${t.total}`,
		title: n
	};
}
var U = () => H.map(({ id: e }) => ({
	id: e,
	enabled: !0
}));
function ce(e) {
	if (!Array.isArray(e)) return U();
	let t = new Map(H.map((e) => [e.id, e])), n = /* @__PURE__ */ new Set(), r = [];
	for (let i of e) {
		if (!i || typeof i != "object") continue;
		let { id: e, enabled: a } = i;
		e && t.has(e) && !n.has(e) && (n.add(e), r.push({
			id: e,
			enabled: typeof a != "boolean" || a
		}));
	}
	return [...r, ...U().filter((e) => !n.has(e.id))];
}
// src/shared/hotkeys.ts
var le = [
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
		id: "tomes",
		label: "Tomes",
		path: "/tomes"
	},
	{
		id: "families",
		label: "Families",
		path: "/families"
	},
	{
		id: "fusion",
		label: "Fusion",
		path: "/fusion"
	},
	{
		id: "gallery",
		label: "Gallery",
		path: "/gallery"
	},
	{
		id: "quests",
		label: "Quests",
		path: "/quests"
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
		label: "Market",
		path: "/market"
	},
	{
		id: "marketAuctions",
		label: "My Auctions",
		path: "/market?tab=overview&view=auctions"
	},
	{
		id: "marketActivity",
		label: "My Activity",
		path: "/market?tab=overview&view=mine"
	},
	{
		id: "marketAlerts",
		label: "Alerts",
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
		id: "history",
		label: "History",
		path: "/history"
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
], ue = [
	{
		id: "focusFirstCard",
		label: "Focus First Card"
	},
	{
		id: "focusLastCard",
		label: "Focus Last Card"
	},
	{
		id: "nextCard",
		label: "Next Card"
	},
	{
		id: "previousCard",
		label: "Previous Card"
	},
	{
		id: "skipOpening",
		label: "Skip Opening"
	},
	{
		id: "later",
		label: "Later"
	},
	{
		id: "nextPack",
		label: "Next Pack/Back to Packs"
	},
	{
		id: "openTen",
		label: "Open 10 at once"
	},
	{
		id: "dismissFoundPack",
		label: "Dismiss Found Pack"
	},
	{
		id: "seeCard",
		label: "See Card"
	},
	{
		id: "share",
		label: "Share"
	},
	{
		id: "home",
		label: "Home"
	}
], W = [
	{
		id: "close",
		label: "Close Tooltip",
		help: "Escape always closes the tooltip, even when this shortcut is unset."
	},
	{
		id: "pin",
		label: "Pin/Unpin"
	},
	{
		id: "refresh",
		label: "Refresh"
	},
	{
		id: "sell",
		label: "Sell"
	},
	{
		id: "gift",
		label: "Gift"
	},
	{
		id: "trade",
		label: "Trade"
	},
	{
		id: "settings",
		label: "Settings"
	},
	{
		id: "listedFor",
		label: "Listed For"
	},
	{
		id: "marketTab",
		label: "Market Tab"
	},
	{
		id: "historyTab",
		label: "My Listing History Tab"
	},
	{
		id: "tradeTab",
		label: "Trade Tab"
	},
	{
		id: "notesTab",
		label: "Notes Tab"
	},
	{
		id: "cycleTabs",
		label: "Cycle Tabs"
	},
	{
		id: "previousTab",
		label: "Previous Tab"
	},
	{
		id: "nextTab",
		label: "Next Tab"
	}
];
function de(e, t = !1) {
	return typeof e == "string" && (/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(e) || t && /^(Arrow(?:Up|Down|Left|Right)|Home|End)$/.test(e));
}
function G(e) {
	return `${e.ctrl}-${e.alt}-${e.shift}-${e.meta}-${e.code}`;
}
function fe(e, t, n, r, i = {}) {
	if (!e || typeof e != "object") return {};
	let a = e, o = [
		...Object.values(n),
		...Object.values(r),
		...Object.values(i)
	].map(G);
	return Object.fromEntries(Object.entries(t).flatMap(([e, t]) => {
		if (!Object.hasOwn(a, e)) return [];
		let n = K(a[e], t.map((e) => ({
			id: e,
			label: e
		})), new Set(o));
		return Object.keys(n).length ? [[e, n]] : [];
	}));
}
function pe(e) {
	return K(e, le);
}
function me(e, t) {
	return K(e, ue, new Set(Object.values(t).map(G)), !0);
}
function he(e, t, n) {
	return K(e, W, new Set([...Object.values(t), ...Object.values(n)].map(G)), !0);
}
function K(e, t, n = /* @__PURE__ */ new Set(), r = !1) {
	let i = {};
	if (!e || typeof e != "object") return i;
	let a = e;
	for (let e of t) {
		let t = a[e.id];
		if (!t || typeof t != "object") continue;
		let o = t;
		if (!de(o.code, r) || ![
			o.ctrl,
			o.alt,
			o.shift,
			o.meta
		].every((e) => typeof e == "boolean")) continue;
		let s = {
			code: o.code,
			ctrl: o.ctrl,
			alt: o.alt,
			shift: o.shift,
			meta: o.meta
		}, c = G(s);
		n.has(c) || (n.add(c), i[e.id] = s);
	}
	return i;
}
// src/shared/sales-prices.ts
var ge = {
	Common: 1,
	Uncommon: 1,
	Rare: 1,
	Epic: 20,
	Legendary: 100,
	Mythic: 500
}, _e = 1000000n;
function ve(e) {
	let t = e.match(/^(-?)(\d*)(?:\.(\d{0,6}))?$/);
	if (!t || !(t[2] || t[3])) return;
	let n = BigInt(t[2]) * _e + BigInt((t[3] ?? "").padEnd(6, "0"));
	return t[1] ? -n : n;
}
function ye(e) {
	let t = e.toLocaleString("en-US", {
		useGrouping: !1,
		maximumFractionDigits: 6
	});
	if (Number(t) === e) return ve(t);
}
function q(e, t = 0) {
	return typeof e == "number" && Number.isFinite(e) && e > 0 && e >= t && ye(e) !== void 0;
}
function be(e) {
	return e === 0 || q(e);
}
function xe(e) {
	return typeof e == "number" && Number.isSafeInteger(e) && e >= 1;
}
function Se(e) {
	if (typeof e != "number" || !Number.isFinite(e)) return;
	let t = ve(String(e)), n = BigInt(2 ** 53 - 1);
	if (t !== void 0 && t >= -n && t <= n) return t;
}
function Ce(e) {
	return Se(e) !== void 0;
}
function we(e, t = "per friend") {
	let n = [];
	for (let r of e) {
		let e = r.trim().replace(/\s+/g, " ");
		if (e) {
			if (e.length > 256) throw Error("Family names can have up to 256 characters.");
			if (n.some((t) => t.toLowerCase() === e.toLowerCase()) || n.push(e), n.length > 50) throw Error(`You can save up to 50 families ${t}.`);
		}
	}
	return n;
}
// src/shared/settings.ts
var Te = "kosmore.settings", Ee = () => ({
	schemaVersion: 1,
	enabled: !0,
	disableHoverTooltipInPulsar: !1,
	disableHoverTooltipInVortex: !1,
	useOverlayButtonInsteadOfHover: !1,
	tooltipTakesFocus: !1,
	outsideClickClosesTooltipOnly: !1,
	fullScreenCenteredOnOpen: !1,
	tooltipUiScale: 100,
	lockTooltipToBrowserZoom: !1,
	socialEnabled: !0,
	socialRemindersMasterEnabled: !0,
	profileRemindersEnabled: !0,
	profileRemindersPinned: !1,
	socialRemindersEnabled: !0,
	socialRemindersPinned: !1,
	tradeRemindersEnabled: !0,
	showTradeFamilyBadges: !0,
	showTradePossibleInterest: !0,
	tradeRaritySymbols: !0,
	showTradeNotes: !0,
	tradeNotesPinned: !1,
	tradeNotesHoverDelayMs: 300,
	tradeNotesDismissDelayMs: 200,
	tradeNotesWidth: 320,
	tradeNotesHeight: 240,
	friendTooltipEnabled: !0,
	friendHoverDelayMs: 300,
	friendDismissDelayMs: 200,
	friendTooltipWidth: 320,
	lockFriendTooltipToBrowserZoom: !1,
	friendTooltipHeight: 560,
	friendTooltipPosition: null,
	hotkeysEnabled: !0,
	navigationHotkeysEnabled: !0,
	hoverTooltipHotkeysEnabled: !0,
	packOpeningsEnabled: !0,
	packOpeningHotkeysEnabled: !1,
	anyKeyDismissesFoundPack: !0,
	autoSkipOpening: !1,
	autoDismissFoundPack: !1,
	showRemainingPackCount: !0,
	packShowPriceWarning: !1,
	packWarningThreshold: 200,
	cardOverlaysEnabled: !0,
	disableCardOverlaysInPulsar: !1,
	disableCardOverlaysInVortex: !1,
	salesOverlaysEnabled: !0,
	showSalesLastSale: !0,
	salesLastSaleSetsPrice: !0,
	salesLastSaleAdjustment: 0,
	showSalesMedian: !1,
	salesMedianSetsPrice: !0,
	salesMedianAdjustment: 0,
	showSalesLowestListing: !0,
	salesLowestListingSetsPrice: !0,
	salesLowestListingAdjustment: 0,
	showSalesMyLastListing: !0,
	salesMyLastListingSetsPrice: !0,
	salesMyLastListingAdjustment: 0,
	salesDiscountEnabled: !1,
	salesDiscountAmount: 25,
	salesDiscountMode: "flat",
	salesDiscountThreshold: 5,
	salesCustomMinimumsEnabled: !1,
	salesCustomMinimums: { ...ge },
	salesQuickPricesEnabled: !1,
	salesQuickPrices: [],
	statBoxesEnabled: !0,
	pinnedAlbumsEnabled: !0,
	closeTooltipWhenAddedToAlbum: !1,
	applyCloseBehaviorToPinnedTooltips: !1,
	hoverDelayMs: 300,
	dismissDelayMs: 200,
	popupWidth: 440,
	popupHeight: 900,
	popupPosition: null,
	showSaleHistoryOverlay: !0,
	showLastSalePriceOverlay: !0,
	useMedianOverlayPrice: !1,
	showActiveAuctionsOverlay: !0,
	showLowestListingPriceOverlay: !0,
	showAuctionBidCounts: !0,
	showOnSaleOverlay: !0,
	highlightLowestListings: !1,
	warnUndercutListings: !1,
	showFriendInterestOverlay: !0,
	showQuestOverlay: !0,
	fusionSettingsEnabled: !0,
	fusionShowPriceWarning: !0,
	fusionWarningThreshold: 200,
	fusionReviewOverlayButton: !0,
	fusionReviewOutsideClickOnly: !0,
	familyImpactOverlaysEnabled: !0,
	useFamilyBlacklist: !1,
	familyBlacklist: [],
	showSalesFamilyOverlay: !0,
	showFusionFamilyOverlay: !0,
	showTradeFamilyOverlay: !0,
	showVortexFamilyOverlay: !0,
	stats: U(),
	hotkeys: {},
	packOpeningHotkeys: {},
	hoverTooltipHotkeys: {},
	pinnedAlbums: {},
	pinnedAlbumHotkeys: {}
});
function De(e) {
	let t = Ee();
	if (!e || typeof e != "object") return t;
	let n = e;
	if (n.schemaVersion !== 1) return t;
	if (t.stats = ce(n.stats), t.hotkeys = pe(n.hotkeys), t.packOpeningHotkeys = me(n.packOpeningHotkeys, t.hotkeys), t.hoverTooltipHotkeys = he(n.hoverTooltipHotkeys, t.hotkeys, t.packOpeningHotkeys), t.popupPosition = M(n.popupPosition), t.friendTooltipPosition = M(n.friendTooltipPosition), Array.isArray(n.familyBlacklist) && n.familyBlacklist.every((e) => typeof e == "string")) try {
		t.familyBlacklist = we(n.familyBlacklist, "in the family blacklist");
	} catch {}
	typeof n.enabled == "boolean" && (t.enabled = n.enabled);
	for (let e of /* @__PURE__ */ "disableHoverTooltipInPulsar.disableCardOverlaysInPulsar.disableHoverTooltipInVortex.disableCardOverlaysInVortex.useOverlayButtonInsteadOfHover.tooltipTakesFocus.outsideClickClosesTooltipOnly.fullScreenCenteredOnOpen.lockTooltipToBrowserZoom.lockFriendTooltipToBrowserZoom.socialEnabled.socialRemindersMasterEnabled.profileRemindersEnabled.profileRemindersPinned.socialRemindersEnabled.socialRemindersPinned.tradeRemindersEnabled.showTradeFamilyBadges.showTradePossibleInterest.tradeRaritySymbols.showTradeNotes.tradeNotesPinned.showTradeFamilyOverlay.showVortexFamilyOverlay.fusionSettingsEnabled.fusionShowPriceWarning.fusionReviewOverlayButton.fusionReviewOutsideClickOnly.familyImpactOverlaysEnabled.useFamilyBlacklist.showSalesFamilyOverlay.friendTooltipEnabled.hotkeysEnabled.navigationHotkeysEnabled.hoverTooltipHotkeysEnabled.packOpeningsEnabled.packOpeningHotkeysEnabled.anyKeyDismissesFoundPack.autoSkipOpening.autoDismissFoundPack.showRemainingPackCount.packShowPriceWarning.cardOverlaysEnabled.showAuctionBidCounts.highlightLowestListings.warnUndercutListings.salesOverlaysEnabled.showSalesLastSale.salesLastSaleSetsPrice.showSalesMedian.salesMedianSetsPrice.useMedianOverlayPrice.showSalesLowestListing.salesLowestListingSetsPrice.showSalesMyLastListing.salesMyLastListingSetsPrice.salesDiscountEnabled.salesCustomMinimumsEnabled.salesQuickPricesEnabled.statBoxesEnabled.pinnedAlbumsEnabled".split(".")) typeof n[e] == "boolean" && (t[e] = n[e]);
	for (let e of [
		"salesLastSaleAdjustment",
		"salesMedianAdjustment",
		"salesLowestListingAdjustment",
		"salesMyLastListingAdjustment"
	]) Ce(n[e]) && (t[e] = n[e]);
	for (let e of ["fusionWarningThreshold", "packWarningThreshold"]) be(n[e]) && (t[e] = n[e]);
	q(n.salesDiscountAmount, 1) && (t.salesDiscountAmount = n.salesDiscountAmount), n.salesDiscountMode === "percent" && (t.salesDiscountMode = "percent"), xe(n.salesDiscountThreshold) && (t.salesDiscountThreshold = n.salesDiscountThreshold), Array.isArray(n.salesQuickPrices) && (t.salesQuickPrices = n.salesQuickPrices.filter((e) => q(e)));
	for (let e of Object.keys(ge)) {
		let r = n.salesCustomMinimums?.[e];
		q(r, ge[e]) && (t.salesCustomMinimums[e] = r);
	}
	typeof n.closeTooltipWhenAddedToAlbum == "boolean" && (t.closeTooltipWhenAddedToAlbum = n.closeTooltipWhenAddedToAlbum), typeof n.applyCloseBehaviorToPinnedTooltips == "boolean" && (t.applyCloseBehaviorToPinnedTooltips = n.applyCloseBehaviorToPinnedTooltips), typeof n.showSaleHistoryOverlay == "boolean" && (t.showSaleHistoryOverlay = n.showSaleHistoryOverlay), typeof n.showLastSalePriceOverlay == "boolean" && (t.showLastSalePriceOverlay = n.showLastSalePriceOverlay), typeof n.showActiveAuctionsOverlay == "boolean" && (t.showActiveAuctionsOverlay = n.showActiveAuctionsOverlay), typeof n.showLowestListingPriceOverlay == "boolean" && (t.showLowestListingPriceOverlay = n.showLowestListingPriceOverlay), typeof n.showOnSaleOverlay == "boolean" && (t.showOnSaleOverlay = n.showOnSaleOverlay), typeof n.showFriendInterestOverlay == "boolean" && (t.showFriendInterestOverlay = n.showFriendInterestOverlay), typeof n.showQuestOverlay == "boolean" && (t.showQuestOverlay = n.showQuestOverlay), typeof n.showFusionFamilyOverlay == "boolean" && (t.showFusionFamilyOverlay = n.showFusionFamilyOverlay), typeof n.hoverDelayMs == "number" && Number.isFinite(n.hoverDelayMs) && (t.hoverDelayMs = Math.min(2e3, Math.max(100, Math.round(n.hoverDelayMs))));
	for (let [e, r, i] of [
		[
			"tradeNotesHoverDelayMs",
			100,
			2e3
		],
		[
			"tradeNotesDismissDelayMs",
			0,
			3e4
		],
		[
			"tradeNotesWidth",
			240,
			1200
		],
		[
			"tradeNotesHeight",
			120,
			1600
		],
		[
			"friendHoverDelayMs",
			100,
			2e3
		],
		[
			"friendDismissDelayMs",
			0,
			3e4
		],
		[
			"friendTooltipWidth",
			240,
			1200
		],
		[
			"friendTooltipHeight",
			160,
			1600
		],
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
			"tooltipUiScale",
			20,
			200
		],
		[
			"popupHeight",
			480,
			1600
		]
	]) {
		let a = n[e];
		typeof a == "number" && Number.isFinite(a) && (t[e] = Math.min(i, Math.max(r, Math.round(a))));
	}
	if (n.pinnedAlbums && typeof n.pinnedAlbums == "object") for (let [e, r] of Object.entries(n.pinnedAlbums)) /^[a-z0-9_]{1,24}$/.test(e) && Array.isArray(r) && Object.defineProperty(t.pinnedAlbums, e, {
		enumerable: !0,
		configurable: !0,
		writable: !0,
		value: [...new Set(r.filter((e) => typeof e == "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(e)))].slice(0, 200)
	});
	return t.pinnedAlbumHotkeys = fe(n.pinnedAlbumHotkeys, t.pinnedAlbums, t.hotkeys, t.packOpeningHotkeys, t.hoverTooltipHotkeys), t;
}
async function Oe() {
	return De((await chrome.storage.local.get(Te))[Te]);
}
async function ke(e) {
	await chrome.storage.local.set({ [Te]: De(e) });
}
// src/shared/listing-cache.ts
var Ae = "kosmore.myListingPrices", J = "kosmore.listingHistory.", je = (e) => e > 0 && Date.now() - e < 3e5, Me = (e, t) => f.every((n) => e.counts[n] >= e.totals[n] || e.limits[n] >= t[n]), Ne = () => new DOMException("Listing lookup canceled.", "AbortError");
function Pe(e, t) {
	let n = new Map(t.map((e) => [e.id, e])), r = new Map(e.map((e) => [e.id, e])), i = /* @__PURE__ */ new Map(), a = [];
	for (let t of e) n.has(t.id) ? (i.set(t.id, a), a = []) : a.push(t);
	if (!i.size) return [...e, ...t];
	let o = [];
	for (let e of t) {
		for (let t of i.get(e.id) ?? []) o.push(t);
		let t = r.get(e.id), n = t && (t.group === "sold" || t.group === "unsold");
		o.push({
			...t,
			...e,
			...n && e.group === "selling" && {
				group: t.group,
				state: t.state,
				endsAt: t.endsAt
			},
			startPrice: t?.startPrice ?? e.startPrice,
			copyId: e.copyId ?? t?.copyId
		});
	}
	return o.concat(a);
}
var Fe = class {
	local;
	session;
	writes = Promise.resolve();
	pending = /* @__PURE__ */ new Map();
	epochs = /* @__PURE__ */ new Map();
	legacyIndex;
	constructor(e, t) {
		this.local = e, this.session = t;
	}
	write(e) {
		let t = this.writes.then(e);
		return this.writes = t.catch(() => {}), t;
	}
	key(e, t) {
		return `kosmore.listingRecord.${e}.${t}`;
	}
	updateSaleStatus(e, t, n = [], r) {
		return this.write(async () => {
			let i = oe(e), a = (await this.local.get(i))[i];
			if (!a && !t.length && !r?.auctionIds.length) return;
			let o = new Set(t.filter((e) => !e.subjectId || !e.finish).map((e) => e.auctionId)), s = [...n];
			if (o.size) for (let [e, t] of Object.entries(a?.copies ?? {})) for (let n of t.auctionIds) o.has(n) && s.push({
				id: n,
				subjectId: e,
				finish: t.finishes?.[n]
			});
			let c = z(a?.changes ?? {}, t, s), l = new Set(Object.values(c).map((e) => e.subjectId)), u = { ...a?.copies };
			for (let [e, t] of Object.entries(u)) !l.has(e) && (!t.auctionIds.length || t.at < Date.now() - 864e5) && delete u[e];
			r && (l.has(r.subjectId) || r.auctionIds.length || a?.copies[r.subjectId]) && r.at >= (u[r.subjectId]?.at ?? 0) && (u[r.subjectId] = {
				at: r.at,
				auctionIds: r.auctionIds,
				finishes: r.finishes
			});
			let d = {
				changes: c,
				copies: u
			};
			return JSON.stringify(a) !== JSON.stringify(d) && await this.local.set({ [i]: d }), c;
		});
	}
	decode(e, t, n) {
		let r = e;
		if (r?.v === 2 && Array.isArray(r.listings)) return r;
		let i = {
			v: 2,
			listings: [],
			complete: !1,
			pruned: !1,
			hasMore: !0,
			checkedAt: 0
		};
		if (r && E(r.latest) && r.latest.subjectId === n) {
			let { id: e, startPrice: t, submittedAt: n, copyId: a } = r.latest;
			i.listings.push({
				id: e,
				startPrice: t,
				submittedAt: n,
				copyId: a
			}), r.verifiedId && r.verifiedId !== e && r.verifiedPrice && i.listings.unshift({
				id: r.verifiedId,
				startPrice: r.verifiedPrice
			}), i.checkedAt = r.reconciledAt ?? 0;
		} else {
			let e = t;
			b(e?.listing) && e.listing.subjectId === n && i.listings.push(this.serverRow(e.listing));
		}
		return i;
	}
	async readTracked(e, t) {
		let n = t.map((t) => this.key(e, t)), r = await this.local.get(n), i = n.some((e) => r[e] === void 0) ? await (this.legacyIndex ??= this.local.get(Ae).then((e) => e[Ae]).catch(() => {
			this.legacyIndex = void 0;
		})) : void 0;
		return t.map((t, a) => this.decode(r[n[a]], i?.entries?.[`${e}:${t}`], t));
	}
	async tracked(e, t) {
		await this.writes;
		let [n] = await this.readTracked(e, [t]);
		return {
			listings: n.listings,
			hasMore: n.hasMore
		};
	}
	saveState(e, t, n = e.complete, r = e.checkedAt) {
		let i = e.pruned || t.length > 100;
		return {
			v: 2,
			listings: t.slice(0, 100),
			complete: n,
			pruned: i,
			hasMore: !n || i,
			checkedAt: r
		};
	}
	serverRow({ id: e, startPrice: t, endsAt: n, finish: r, state: i, copyId: a, group: o }) {
		return {
			id: e,
			startPrice: t,
			endsAt: n,
			finish: r,
			state: i,
			copyId: a,
			group: o
		};
	}
	async attachMetadata(e, t, n, r) {
		return this.write(async () => {
			r.throwIfAborted();
			let [i] = await this.readTracked(e, [t]), a = !1, o = i.listings.map((e) => {
				let t = n.get(e.id.toLowerCase()), r = t ? y(e, t) : e;
				return r !== e && (a = !0), r;
			});
			return r.throwIfAborted(), a && await this.local.set({ [this.key(e, t)]: {
				...i,
				listings: o
			} }), a;
		});
	}
	async record(e, t) {
		let n = /* @__PURE__ */ new Map();
		for (let e of t) {
			let t = n.get(e.subjectId) ?? [];
			t.push(e), n.set(e.subjectId, t);
		}
		n.size && await this.write(async () => {
			let t = [...n.keys()], r = await this.readTracked(e, t), i = {};
			for (let [a, o] of t.entries()) {
				let t = r[a], s = [...t.listings];
				for (let { id: e, startPrice: r, submittedAt: i, copyId: a } of n.get(o)) {
					let n = s.findIndex((t) => t.id === e);
					if (n >= 0) {
						s[n] = {
							...s[n],
							submittedAt: s[n].submittedAt ?? i,
							copyId: s[n].copyId ?? a
						};
						continue;
					}
					let o = i > (s[0]?.submittedAt ?? t.checkedAt), c = s.findIndex((e) => e.submittedAt !== void 0 && e.submittedAt < i);
					s.splice(o ? 0 : c > 0 ? c : s.length, 0, {
						id: e,
						startPrice: r,
						submittedAt: i,
						copyId: a
					});
				}
				i[this.key(e, o)] = this.saveState(t, s);
			}
			await this.local.set(i);
		});
	}
	async observe(e, t) {
		let n = /* @__PURE__ */ new Map();
		for (let e of t) {
			let t = n.get(e.subjectId) ?? [];
			t.push(e), n.set(e.subjectId, t);
		}
		await this.importRows(e, n, Date.now(), !1, new AbortController().signal);
	}
	async importRows(e, t, n, r, i) {
		t.size && await this.write(async () => {
			i.throwIfAborted();
			let a = [...t.keys()], o = await this.readTracked(e, a), s = {};
			for (let [i, c] of a.entries()) {
				let a = o[i], l = t.get(c).map((e) => this.serverRow(e)), u = Pe(a.listings, l), d = a.listings[0], f = !d || l.some((e) => e.id === d.id) && n >= (d.submittedAt ?? a.checkedAt), p = f ? l[0]?.id ?? d?.id : d.id, m = u.findIndex((e) => e.id === p);
				m > 0 && u.unshift(...u.splice(m, 1)), s[this.key(e, c)] = this.saveState(a, u, r, f ? Math.max(n, a.checkedAt) : a.checkedAt);
			}
			i.throwIfAborted(), await this.local.set(s);
		});
	}
	async history(e, t, n, r, i, a) {
		let o = Date.now(), s = await this.batch(e);
		i.throwIfAborted();
		let c = n === "refresh", l = s && je(s.fetchedAt) ? s : void 0, u = c ? {
			selling: 180,
			sold: 180,
			unsold: 180
		} : a ?? (l ? w(l) : p()), d = await this.ensure(e, u, r, i, c || !!s && !l);
		if (c && f.some((e) => d.counts[e] < Math.min(d.totals[e], 180))) throw Error("Your listing history stopped before the newest auctions were returned.");
		let m = /* @__PURE__ */ new Map(), h = C(d) && (!c || d.listings.length <= 180);
		m.set(t, []);
		let g = c ? d.listings.slice(0, 180) : d.listings;
		for (let e of g) {
			if (!c && e.subjectId !== t) continue;
			let n = m.get(e.subjectId) ?? [];
			n.push(e), m.set(e.subjectId, n);
		}
		return await this.importRows(e, m, d.startedAt ?? Math.min(o, d.fetchedAt), h, i), c ? void 0 : {
			...d,
			listings: m.get(t)
		};
	}
	async invalidate(e) {
		this.epochs.set(e, (this.epochs.get(e) ?? 0) + 1), await this.write(async () => {
			let t = J + e, n = await this.session.get(t);
			x(n[t]) && await this.session.set({ [t]: {
				...n[t],
				fetchedAt: 0
			} });
		});
	}
	async saveBatch(e, t, n) {
		await this.write(async () => {
			if (this.epochs.get(e) !== n) return;
			let r = await this.session.get(null), i = J + e, a = Object.keys(r).filter((e) => e.startsWith(J)), o = JSON.stringify(t).length * 2;
			if (o > 6e6) return;
			let s = a.filter((e) => e !== i).sort((e, t) => Number(r[e]?.fetchedAt ?? 0) - Number(r[t]?.fetchedAt ?? 0));
			o += s.reduce((e, t) => e + JSON.stringify(r[t]).length * 2, 0);
			let c = [];
			for (; o > 6e6 && s.length;) {
				let e = s.shift();
				o -= JSON.stringify(r[e]).length * 2, c.push(e);
			}
			c.length && await this.session.remove(c), await this.session.set({ [i]: t });
		});
	}
	async batch(e) {
		await this.writes;
		let t = J + e, n = (await this.session.get(t))[t];
		return x(n) ? n : void 0;
	}
	async ensure(e, t, n, r, i = !1) {
		for (r.throwIfAborted(), this.epochs.has(e) || this.epochs.set(e, 0);;) {
			let a = this.epochs.get(e);
			if (!i) {
				let n = await this.batch(e);
				if (r.throwIfAborted(), n && je(n.fetchedAt) && Me(n, t)) return n;
			}
			let o = this.pending.get(e);
			if (!o || o.controller.signal.aborted) {
				o = {
					limits: { ...t },
					started: !1,
					controller: new AbortController(),
					users: 0,
					readers: /* @__PURE__ */ new Map(),
					promise: Promise.resolve(void 0)
				};
				let n = o;
				this.pending.set(e, n), n.promise = Promise.resolve().then(async () => {
					n.controller.signal.throwIfAborted(), n.started = !0;
					let t = Date.now(), r = /* @__PURE__ */ new Set(), i;
					for (;;) {
						let e = [...n.readers.keys()].find((e) => !r.has(e));
						if (!e) throw Error("The game tab closed during the listing lookup. Try again.");
						r.add(e);
						try {
							i = await e(n.limits, n.controller.signal);
							break;
						} catch (e) {
							if (n.controller.signal.aborted || !/Receiving end|port closed|tab.*closed|No tab/i.test(String(e))) throw e;
						}
					}
					if (!i || !x(i)) throw Error("Your listing history is unavailable.");
					n.controller.signal.throwIfAborted(), i = {
						...i,
						startedAt: t
					};
					let o = await this.batch(e);
					if (o && i.fetchedAt <= o.fetchedAt && (i = {
						...i,
						fetchedAt: o.fetchedAt + 1
					}), o && je(o.fetchedAt)) {
						for (let e of f) if (n.limits[e] > o.limits[e] && i.counts[e] <= o.counts[e] && i.counts[e] < i.totals[e]) throw Error("Your listing history stopped before all auctions were returned.");
					}
					return await this.saveBatch(e, i, a), i;
				});
				let r = () => {
					this.pending.get(e) === n && this.pending.delete(e);
				};
				n.promise.then(r, r);
			} else if (!o.started) for (let e of f) o.limits[e] = Math.max(o.limits[e], t[e]);
			let s = await this.consume(o, n, r);
			if (r.throwIfAborted(), Me(s, t)) return s;
			i = !1;
		}
	}
	consume(e, t, n) {
		return e.users++, e.readers.set(t, (e.readers.get(t) ?? 0) + 1), new Promise((r, i) => {
			let a = !1, o = () => {
				if (a) return !1;
				a = !0, n.removeEventListener("abort", s), e.users--;
				let r = e.readers.get(t) - 1;
				return r ? e.readers.set(t, r) : e.readers.delete(t), e.users || e.controller.abort(), !0;
			}, s = () => {
				o() && i(Ne());
			};
			n.addEventListener("abort", s, { once: !0 }), n.aborted ? s() : e.promise.then((e) => {
				o() && r(e);
			}, (e) => {
				o() && i(e);
			});
		});
	}
};
// src/listing-background.ts
function Ie(e) {
	let t = new Fe(chrome.storage.local, chrome.storage.session);
	chrome.runtime.onMessage.addListener((n, r, i) => r.id !== chrome.runtime.id || r.tab?.id === void 0 || r.frameId !== 0 || !r.url?.startsWith("https://kosmora.io/") || !V(n) || n.op !== "listingCache" && n.op !== "listingSavedPrice" && n.op !== "listingAccountVerified" && n.op !== "listingRecord" && n.op !== "listingCopiesObserved" && n.op !== "listingObserved" ? !1 : ((async () => {
		let { accountKey: r, subjectId: i } = n;
		if (n.op === "listingCopiesObserved") return await t.updateSaleStatus(r, [], [], {
			subjectId: i,
			...n.copies
		}), null;
		if (n.op === "listingAccountVerified") return e.importVerified(r);
		if (n.op === "listingSavedPrice") return e.latest(r, i);
		if (n.op === "listingCache") return t.tracked(r, i);
		if (n.op === "listingRecord") {
			let i = n.changes ?? [], a = await e.knownSubjects(r, i).catch(() => []), o = i.length ? await t.updateSaleStatus(r, i, a) : void 0, s = [...n.records], c = [];
			for (let { auctionId: e, submittedAt: t, copyId: r, startPrice: i } of n.receipts ?? []) {
				let n = {
					id: e,
					subjectId: o?.[e]?.subjectId,
					submittedAt: t,
					copyId: r ?? o?.[e]?.copyId,
					startPrice: i
				};
				E(n) ? s.push(n) : c.push({
					auctionId: e,
					submittedAt: t
				});
			}
			if (!s.length && !c.length) return null;
			await e.record(r, s, c), await t.record(r, s);
		} else if (n.op === "listingObserved") {
			if (await t.updateSaleStatus(r, [], n.rows), n.saveHistory === !1) return null;
			let i = await e.observe(r, n.rows);
			i.length && await t.record(r, i), await t.observe(r, n.rows);
		}
		let a = await chrome.tabs.query({ url: "https://kosmora.io/*" });
		return await Promise.allSettled(a.flatMap((e) => e.id === void 0 ? [] : [chrome.tabs.sendMessage(e.id, {
			requestId: crypto.randomUUID(),
			op: "listingCacheChanged",
			accountKey: r
		}, { frameId: 0 })])), null;
	})().then((e) => i({
		requestId: n.requestId,
		ok: !0,
		data: e
	}), (e) => i({
		requestId: n.requestId,
		ok: !1,
		error: l(e)
	})), !0));
}
// src/listing-history-store.ts
var Le = () => ({
	cursor: 0,
	uploaded: 0,
	erasedAt: 0
}), Y = 2 ** 53 - 1, X = (e) => "local:" + e;
function Z(e) {
	return new Promise((t, n) => {
		e.onsuccess = () => t(e.result), e.onerror = () => n(e.error);
	});
}
var Re = class {
	database;
	imports = /* @__PURE__ */ new Map();
	open() {
		return this.database ??= new Promise((e, t) => {
			let n = indexedDB.open("kosmore.confirmed-listings", 2);
			n.onupgradeneeded = (e) => {
				if (e.oldVersion < 1) {
					let e = n.result.createObjectStore("records", {
						keyPath: "seq",
						autoIncrement: !0
					});
					e.createIndex("auction", ["owner", "id"], { unique: !0 }), e.createIndex("latest", [
						"owner",
						"subjectId",
						"submittedAt",
						"id"
					]), e.createIndex("outbox", ["owner", "seq"]), n.result.createObjectStore("state");
				}
				n.transaction.objectStore("records").createIndex("copy", [
					"owner",
					"copyId",
					"submittedAt"
				]);
			}, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
		}).catch((e) => {
			throw this.database = void 0, e;
		});
	}
	async transaction(e, t) {
		let n = (await this.open()).transaction(["records", "state"], e), r = new Promise((e, t) => {
			n.oncomplete = () => e(), n.onabort = () => t(n.error ?? /* @__PURE__ */ Error("Listing history transaction aborted."));
		});
		try {
			let e = await t(n.objectStore("records"), n.objectStore("state"));
			return await r, e;
		} catch (e) {
			try {
				n.abort();
			} catch {}
			throw await r.catch(() => {}), e;
		}
	}
	async insert(e, t, n, r = !1, i) {
		for (let a of n) {
			let n = a.id.toLowerCase();
			await Z(e.index("auction").getKey([t, n])) || await Z(e.add({
				id: n,
				subjectId: a.subjectId,
				startPrice: a.startPrice,
				...a.finish && { finish: a.finish },
				submittedAt: a.submittedAt,
				copyId: a.copyId,
				owner: t,
				legacy: r,
				epoch: i
			}));
		}
	}
	capture(e, t, n, r) {
		return this.transaction("readwrite", async (i, a) => {
			let o = r ? await Z(a.get(r)) : void 0, s = o?.generation === void 0 ? void 0 : JSON.stringify([r, o.generation]);
			if (await this.insert(i, X(e), t, !1, s), !n.length) return;
			let c = "receipts:" + e, l = await Z(a.get(c)) ?? /* @__PURE__ */ new Map();
			for (let e of n) l.has(e.auctionId) || l.set(e.auctionId, e.submittedAt);
			await Z(a.put(l, c));
		});
	}
	resolveReceipts(e, t) {
		return this.transaction("readwrite", async (n, r) => {
			let i = "receipts:" + e, a = await Z(r.get(i)), o = [];
			if (!a?.size) return o;
			for (let e of t) {
				let t = e.id.toLowerCase(), n = a.get(t);
				n && (a.delete(t), o.push({
					id: t,
					submittedAt: n,
					subjectId: e.subjectId,
					startPrice: e.startPrice,
					finish: e.finish,
					copyId: e.copyId
				}));
			}
			return o.length && (await this.insert(n, X(e), o), await Z(r.put(a, i))), o;
		});
	}
	importVerified(e) {
		let t = this.imports.get(e);
		if (t) return t;
		let n = this.importLegacy(e).catch((t) => {
			throw this.imports.delete(e), t;
		});
		return this.imports.set(e, n), n;
	}
	async importLegacy(e) {
		let t = "import:" + e;
		if (await this.transaction("readonly", (e, n) => Z(n.get(t)))) return;
		let n = await chrome.storage.local.get(null), r = "kosmore.listingRecord." + e + ".", i = [];
		function a(e, t) {
			if (!t || typeof t != "object") return;
			let n = {
				...t,
				subjectId: e
			};
			E(n) && i.push(n);
		}
		for (let [e, t] of Object.entries(n)) {
			if (!e.startsWith(r) || !t || typeof t != "object") continue;
			let n = e.slice(r.length);
			if ("latest" in t && a(n, t.latest), "listings" in t && Array.isArray(t.listings)) for (let e of t.listings) a(n, e);
		}
		let o = n[Ae];
		for (let [t, n] of Object.entries(o?.entries ?? {})) t.startsWith(e + ":") && a(t.slice(e.length + 1), n?.listing);
		await this.transaction("readwrite", async (n, r) => {
			await Z(r.get(t)) || (await this.insert(n, X(e), i, !0), await Z(r.put(!0, t)));
		});
	}
	async knownSubjects(e, t, n) {
		return await this.importVerified(e), this.transaction("readonly", async (r, i) => {
			let a = await Z(i.get("cutoff:" + e)) ?? 0, o = [X(e), ...t ? [t] : []], s = [];
			for (let { auctionId: e, relistOf: t, copyId: i } of n) for (let n of o) {
				let o;
				if (o = await Z(r.index("auction").get([n, t ?? e])), (!o || o.submittedAt <= a) && i) {
					let e = IDBKeyRange.bound([
						n,
						i,
						a + 1
					], [
						n,
						i,
						Y
					]);
					o = (await Z(r.index("copy").openCursor(e, "prev")))?.value;
				}
				if (o && o.submittedAt > a) {
					s.push({
						id: e,
						subjectId: o.subjectId,
						...o.finish && { finish: o.finish },
						copyId: i ?? o.copyId
					});
					break;
				}
			}
			return s;
		});
	}
	async latest(e, t, n) {
		return await this.importVerified(e), this.transaction("readonly", async (r, i) => {
			let a = await Z(i.get("cutoff:" + e)) ?? 0;
			return (await Promise.all([X(e), ...t ? [t] : []].map(async (e) => {
				let t = IDBKeyRange.bound([
					e,
					n,
					a + 1
				], [
					e,
					n,
					Y,
					[]
				]);
				return (await Z(r.index("latest").openCursor(t, "prev")))?.value;
			}))).filter((e) => !!e).sort((e, t) => t.submittedAt - e.submittedAt || (e.id < t.id ? 1 : e.id > t.id ? -1 : 0))[0];
		});
	}
	state(e) {
		return this.transaction("readonly", async (t, n) => await Z(n.get(e)) ?? Le());
	}
	pending(e, t) {
		return this.transaction("readonly", (n) => Z(n.index("outbox").getAll(IDBKeyRange.bound([X(e), t + 1], [X(e), Y]), 40)));
	}
	acknowledge(e, t, n) {
		return this.transaction("readwrite", async (r, i) => {
			let a = await Z(i.get(e));
			a?.generation === t && await Z(i.put({
				...a,
				uploaded: Math.max(a.uploaded, n)
			}, e));
		});
	}
	apply(e, t, n) {
		return this.transaction("readwrite", async (r, i) => {
			let a = await Z(i.get(e)) ?? Le();
			if (a.generation !== void 0 && n.generation < a.generation) return !1;
			let o = a.generation !== n.generation;
			if (!o && a.cursor > n.cursor) return !1;
			if (o && n.erasedAt) {
				let o = r.index("outbox");
				for (let r of [e, X(t)]) {
					let t = IDBKeyRange.bound([r, 0], [r, Y]), i = o.openCursor(t);
					await new Promise((t, o) => {
						i.onerror = () => o(i.error), i.onsuccess = () => {
							let o = i.result;
							o ? ((r === e || o.value.legacy || a.generation !== void 0 && o.value.epoch === JSON.stringify([e, a.generation]) || o.value.submittedAt <= n.erasedAt) && o.delete(), o.continue()) : t();
						};
					});
				}
				await Z(i.put(!0, "import:" + t));
				let s = "receipts:" + t, c = await Z(i.get(s));
				if (c) {
					for (let [e, t] of c) t <= n.erasedAt && c.delete(e);
					await Z(i.put(c, s));
				}
				let l = await Z(i.get("cutoff:" + t)) ?? 0;
				await Z(i.put(Math.max(l, n.erasedAt), "cutoff:" + t));
			}
			await this.insert(r, e, n.records);
			for (let e of n.records) {
				let n = await Z(r.index("auction").get([X(t), e.id]));
				n && (n.submittedAt !== e.submittedAt || n.startPrice !== e.startPrice || n.subjectId !== e.subjectId) && await Z(r.put({
					...n,
					subjectId: e.subjectId,
					startPrice: e.startPrice,
					submittedAt: e.submittedAt
				}));
			}
			return await Z(i.put({
				...a,
				generation: n.generation,
				cursor: n.cursor,
				erasedAt: n.erasedAt
			}, e)), !!n.records.length || o && !!n.erasedAt;
		});
	}
}, ze = "/v1/me/listing-history", Be = "kosmore.listing-history", Q = (e) => typeof e == "number" && Number.isSafeInteger(e) && e >= 0;
function Ve(e) {
	if (!e || !Q(e.generation) || !Q(e.cursor) || !Q(e.erasedAt) || typeof e.hasMore != "boolean" || !Array.isArray(e.records) || !e.records.every(E)) throw Error("Services returned invalid listing history.");
	return e;
}
var He = class {
	link;
	store = new Re();
	work = Promise.resolve();
	queued = /* @__PURE__ */ new Map();
	retry = /* @__PURE__ */ new Map();
	constructor(e) {
		this.link = e;
	}
	install() {
		let e = async () => {
			chrome.alarms && !await chrome.alarms.get(Be) && await chrome.alarms.create(Be, { periodInMinutes: 5 });
		};
		e().catch(() => {}), chrome.runtime.onStartup?.addListener(() => {
			e().catch(() => {}), this.schedule();
		}), chrome.alarms?.onAlarm.addListener((e) => {
			e.name === Be && chrome.tabs.query({ url: "https://kosmora.io/*" }).then((e) => {
				e.length && this.schedule();
			});
		});
	}
	serial(e) {
		let t = this.work.then(e);
		return this.work = t.then(() => {}, () => {}), t;
	}
	schedule(e) {
		this.link().then((t) => {
			if (!t || e && e !== t.handle) return;
			let n = this.queued.get(t.scope);
			if (this.queued.set(t.scope, !!n || e === void 0), n === void 0) return this.serial(async () => {
				let e = this.queued.get(t.scope);
				this.queued.delete(t.scope), (this.retry.get(t.scope) ?? 0) > Date.now() || t.signal.aborted || await this.sync(t, e);
			});
		}).catch(() => {});
	}
	importVerified(e) {
		return this.store.importVerified(e);
	}
	async knownSubjects(e, t) {
		let n = t.filter((e) => !e.subjectId && (e.copyId || e.relistOf));
		if (!n.length) return [];
		let r = await this.link(), i = r?.handle === e, a = await this.store.knownSubjects(e, i ? r.scope : void 0, n);
		return i && r.signal.throwIfAborted(), a;
	}
	async latest(e, t) {
		let n = await this.link(), r = n?.handle === e, i = await this.store.latest(e, r ? n.scope : void 0, t);
		if (r && n.signal.throwIfAborted(), !i) return;
		let { id: a, subjectId: o, startPrice: s, submittedAt: c, copyId: l } = i;
		return {
			id: a,
			subjectId: o,
			startPrice: s,
			submittedAt: c,
			copyId: l
		};
	}
	async record(e, t, n = []) {
		let r = await this.link().catch(() => void 0);
		await this.store.capture(e, t, n, r?.handle === e ? r.scope : void 0), t.length && this.schedule(e);
	}
	async observe(e, t) {
		let n = await this.store.resolveReceipts(e, t);
		return n.length && this.schedule(e), n;
	}
	async checked(e, t, n, r) {
		e.signal.throwIfAborted();
		let i = await e.request(t, n, r);
		if (e.signal.throwIfAborted(), !i.ok) {
			let t = Number(i.headers.get("Retry-After"));
			throw (i.status === 429 || i.status === 503 || i.status === 404) && this.retry.set(e.scope, Date.now() + Math.max(300, Number.isFinite(t) ? t : 0) * 1e3), Error("Listing history is unavailable (HTTP " + i.status + ").");
		}
		return i;
	}
	async changed(e) {
		let t = await chrome.tabs.query({ url: "https://kosmora.io/*" });
		await Promise.allSettled(t.filter((e) => e.id !== void 0).map((t) => chrome.tabs.sendMessage(t.id, {
			op: "confirmedListingsChanged",
			account: e
		}, { frameId: 0 })));
	}
	async pull(e) {
		let t = await this.store.state(e.scope), n = !1;
		do {
			let r = new URLSearchParams({ after: String(t.cursor) });
			t.generation !== void 0 && r.set("generation", String(t.generation));
			let i = Ve(await (await this.checked(e, ze + "/changes?" + r)).json());
			if (i.hasMore && (!i.records.length || i.generation === t.generation && i.cursor <= t.cursor)) throw Error("Listing history cursor did not advance.");
			if (e.signal.throwIfAborted(), n = await this.store.apply(e.scope, e.handle, i) || n, t = await this.store.state(e.scope), !i.hasMore) break;
		} while (!e.signal.aborted);
		return n && await this.changed(e.handle), t;
	}
	async sync(e, t) {
		let n = await this.store.state(e.scope);
		for ((t || n.generation === void 0) && (n = await this.pull(e)); !e.signal.aborted;) {
			let t = await this.store.pending(e.handle, n.uploaded);
			if (!t.length) return;
			let r = t.filter((e) => e.submittedAt > n.erasedAt && !(n.erasedAt && e.legacy) && e.subjectId !== "0" && e.startPrice.length <= 50).map(({ id: e, subjectId: t, copyId: n, startPrice: r, submittedAt: i }) => ({
				id: e,
				subjectId: t,
				copyId: n,
				startPrice: r,
				submittedAt: i
			}));
			r.length && await this.checked(e, ze + "/batch", "POST", {
				generation: n.generation,
				records: r
			});
			let i = t[t.length - 1].seq;
			e.signal.throwIfAborted(), await this.store.acknowledge(e.scope, n.generation, i), n.uploaded = i;
		}
	}
	erase(e, t) {
		return this.serial(async () => {
			let n = await this.link();
			if (!n || n.scope !== JSON.stringify([t, e])) throw Error("The linked Services account changed.");
			let r = await this.store.state(n.scope);
			r.generation === void 0 && (r = await this.pull(n));
			let i = await (await this.checked(n, ze + "?generation=" + r.generation, "DELETE")).json();
			if (!Q(i.generation) || i.generation <= r.generation || !Q(i.erasedAt)) throw Error("Services could not confirm erasure.");
			await this.store.apply(n.scope, n.handle, {
				...i,
				records: [],
				hasMore: !1,
				cursor: 0
			}), await this.changed(n.handle);
		});
	}
}, Ue = class {
	db;
	open() {
		return this.db ??= new Promise((e, t) => {
			let n = indexedDB.open("kosmore.services", 1);
			n.onupgradeneeded = () => {
				n.result.createObjectStore("connection");
				for (let e of ["cards", "listings"]) n.result.objectStoreNames.contains(e) || n.result.createObjectStore(e, { keyPath: "key" }).createIndex("fetchedAt", "fetchedAt");
			}, n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
		}).catch((e) => {
			throw this.db = void 0, e;
		});
	}
	async get(e, t) {
		let n = await this.open();
		return new Promise((r, i) => {
			let a = n.transaction(e).objectStore(e).get(t);
			a.onsuccess = () => r(a.result), a.onerror = () => i(a.error);
		});
	}
	async connection() {
		let e = await this.open();
		return new Promise((t, n) => {
			let r = e.transaction("connection").objectStore("connection").get("current");
			r.onsuccess = () => t(r.result), r.onerror = () => n(r.error);
		});
	}
	async getCards(e) {
		let t = (await this.open()).transaction("cards").objectStore("cards");
		return Promise.all(e.map((e) => new Promise((n, r) => {
			let i = t.get(e);
			i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
		})));
	}
	async saveConnection(e, t = !0) {
		let n = await this.open();
		return new Promise((r, i) => {
			let a = n.transaction(["connection", "listings"], "readwrite");
			a.oncomplete = () => r(), a.onabort = () => i(a.error), a.objectStore("connection").put(e, "current"), t && a.objectStore("listings").clear();
		});
	}
	async save(e, t, n) {
		let r = await this.open();
		return n.throwIfAborted(), new Promise((i, a) => {
			let o = r.transaction(["cards", "listings"], "readwrite"), s = () => {
				try {
					o.abort();
				} catch {}
			};
			n.addEventListener("abort", s, { once: !0 }), o.oncomplete = () => {
				n.removeEventListener("abort", s), i();
			}, o.onabort = () => {
				n.removeEventListener("abort", s), a(n.reason ?? o.error);
			};
			for (let t of e) o.objectStore("cards").put(t);
			for (let e of t) o.objectStore("listings").put(e);
		});
	}
	async prune(e) {
		let t = await this.open();
		return new Promise((n, r) => {
			let i = t.transaction(["cards", "listings"], "readwrite");
			i.oncomplete = () => n(), i.onabort = () => r(i.error);
			for (let t of ["cards", "listings"]) {
				let n = i.objectStore(t).index("fetchedAt").openCursor(IDBKeyRange.upperBound(e));
				n.onsuccess = () => {
					let e = n.result;
					e && (e.delete(), e.continue());
				};
			}
		});
	}
}, We = 864e5, Ge = 100, $ = "kosmore.deferredCard", Ke = "kosmore.pendingAccountLink", qe = 1;
function Je() {
	let t = new Ue(), n = "", r, i = !0, a, o = new AbortController(), s = 0, c = /* @__PURE__ */ new Map(), u = !1, d, f, p, m = 0, h = /* @__PURE__ */ new Map(), g, _ = 0, v = /* @__PURE__ */ new Set(), y, b = fetch(chrome.runtime.getURL("services-config.json")).then(async (t) => {
		if (!t.ok) throw Error("Could not load the packaged Services URL.");
		let n = e(await t.json());
		if (typeof n.defaultBaseUrl != "string") throw Error("Missing defaultBaseUrl in services-config.json.");
		return {
			defaultBase: F(n.defaultBaseUrl),
			legacyBase: typeof n.legacyBaseUrl == "string" ? F(n.legacyBaseUrl) : void 0
		};
	}), x = Promise.all([t.connection(), b]).then(async ([e, o]) => {
		r = o.defaultBase;
		let s = e?.base || r;
		i = e?.usesDefault ?? (s === r || s === o.legacyBase), n = i ? r : s;
		let c = !!e && e.base !== n;
		a = c ? void 0 : e?.session, e && (c || e.usesDefault === void 0) && await t.saveConnection({
			base: n,
			usesDefault: i,
			session: a
		}, c), f = (await chrome.storage.session?.get(Ke))?.[Ke], f && f.target !== n && await M(), c && await D();
		let l = (await chrome.storage?.session?.get($))?.[$];
		l?.base === n && l?.player === a?.playerId && P(l?.id) && (y = l.id);
	}), S = Promise.resolve(), C = (e) => {
		let t = S.then(e);
		return S = t.catch(() => {}), t;
	}, w = fetch(chrome.runtime.getURL("card-cache-config.json")).then(async (t) => {
		let n = e(await t.json()), r = n.retentionDays, i = n.freshnessSeconds;
		if (typeof r != "number" || !Number.isInteger(r) || r < 1 || typeof i != "number" || !Number.isInteger(i) || i < 1 || i > r * 86400) throw Error("Invalid card cache configuration.");
		return {
			retention: r * We,
			freshness: i * 1e3
		};
	});
	w.catch(() => {}), x.catch(() => {});
	let T = new He(async () => {
		await x;
		let e = a, t = n, r = o.signal;
		if (!(!e?.handle || e.blocked || e.expiresAt <= Date.now() || e.scopes && !e.scopes.includes("listings"))) return {
			scope: JSON.stringify([t, e.playerId]),
			handle: e.handle.toLowerCase(),
			signal: r,
			async request(n, i = "GET", o) {
				let s = await k(t, n, r, e.token, o, i);
				return s.status === 403 && (await s.clone().json().catch(() => ({})))?.error === "scope_missing" ? await C(async () => {
					!r.aborted && a === e && await O(t, {
						...e,
						scopes: (e.scopes ?? ["identity"]).filter((e) => e !== "listings")
					});
				}) : await H(s, t, e, r), s;
			}
		};
	});
	T.install();
	let E = () => ({
		base: n,
		...a && {
			playerId: a.playerId,
			handle: a.handle ?? "Linked Kosmora account",
			expiresAt: a.expiresAt,
			blocked: a.blocked
		}
	});
	async function D(e) {
		y = e, e ? await chrome.storage?.session?.set({ [$]: {
			id: e,
			base: n,
			player: a?.playerId
		} }).catch(() => {}) : await chrome.storage?.session?.remove($).catch(() => {});
	}
	async function O(e, r, s = i) {
		await M(), o.abort(), o = new AbortController();
		for (let e of c.values()) e.resolve();
		c.clear(), v.clear(), g = void 0, _ = 0, m = 0, h.clear(), n = e, i = s, a = r, await D(), await t.saveConnection({
			base: n,
			usesDefault: i,
			session: a
		}), await chrome.storage.local.set({ [te]: crypto.randomUUID() });
	}
	async function k(e, t, n, r, i, a = i === void 0 ? "GET" : "POST") {
		return fetch(e + t, {
			method: a,
			headers: {
				...r && { Authorization: `Bearer ${r}` },
				...i !== void 0 && { "Content-Type": "application/json" }
			},
			...i !== void 0 && { body: JSON.stringify(i) },
			credentials: "omit",
			cache: "no-store",
			redirect: "error",
			signal: AbortSignal.any([n, AbortSignal.timeout(15e3)])
		});
	}
	let A = (e) => btoa(String.fromCharCode(...e)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), j = () => A(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(32)));
	async function M() {
		f && (await chrome.storage.session.remove(Ke), f = void 0, await chrome.declarativeNetRequest?.updateSessionRules({ removeRuleIds: [qe] }));
	}
	async function N(e) {
		await chrome.storage.session.set({ [Ke]: e }), f = e;
	}
	async function ee(t, n, r) {
		let i = j(), a = j(), o = async (e) => A(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e)))), s = n ? await o(n) : void 0, c = f;
		if (c && c.target === t && c.expiresAt > Date.now() && (!n || c.inviteHash === s)) return c;
		await M();
		let l = Date.now() + 6e5, u = await k(t, "/v1/connect/start", r, void 0, {
			redirectUri: chrome.identity.getRedirectURL("kosmore-services"),
			handoffChallenge: await o(i),
			state: a,
			...n && { inviteCode: n }
		});
		if (!u.ok) throw e(await u.json().catch(() => ({}))).error === "invite_unavailable" ? Error("This invite is unavailable. Ask the administrator for a new code.") : Error(`Services could not start account linking (HTTP ${u.status}).`);
		let d = new URL(e(await u.json()).authorizationUrl);
		if (d.origin !== "https://kosmora.io" || d.username || d.password) throw Error("Services returned an unexpected Kosmora authorization URL.");
		return {
			target: t,
			verifier: i,
			state: a,
			authorizationUrl: d.href,
			expiresAt: l,
			inviteHash: s
		};
	}
	async function I(e, t, i = !1) {
		let a = F(e);
		if (i && !chrome.declarativeNetRequest?.updateSessionRules) throw Error("This browser cannot receive a sign-in link in another tab.");
		if (!await chrome.permissions.contains({ origins: [ne(a)] })) throw Error("Allow access to the Services host before connecting.");
		d?.abort();
		let s = new AbortController();
		d = s;
		let c = await C(async () => {
			s.signal.throwIfAborted(), n !== a && await O(a, void 0, a === r);
			let e = AbortSignal.any([s.signal, o.signal]), c = await ee(a, t?.trim(), e);
			if (e.throwIfAborted(), i) {
				let e = chrome.runtime.id + "\\.chromiumapp\\.org";
				await N(c), await chrome.declarativeNetRequest.updateSessionRules({
					removeRuleIds: [qe],
					addRules: [{
						id: qe,
						action: {
							type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
							redirect: { regexSubstitution: chrome.runtime.getURL("link-complete.html") + "#\\1" }
						},
						condition: {
							regexFilter: `^https://${e}/kosmore-services\\?((code|error)=[A-Za-z0-9_-]+&state=${c.state})$`,
							isUrlFilterCaseSensitive: !0,
							resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME]
						}
					}]
				});
			} else await M();
			return c;
		});
		if (i) return { url: c.authorizationUrl };
		let u = AbortSignal.any([s.signal, o.signal]);
		u.throwIfAborted();
		let f;
		try {
			f = await chrome.identity.launchWebAuthFlow({
				url: c.authorizationUrl,
				interactive: !0
			});
		} catch (e) {
			throw /couldn.t create a browser window/i.test(l(e)) ? (await C(async () => {
				u.throwIfAborted(), await N(c);
			}), Error("The browser could not open the sign-in window. Choose Copy Link to continue in another tab.")) : e;
		}
		if (!f) throw Error("Kosmora did not complete account linking.");
		return oe(c, f, u);
	}
	async function ae(e) {
		let { link: t, signal: r } = await C(async () => {
			let t = f;
			if (!t || t.target !== n || t.expiresAt <= Date.now()) throw Error("This link has expired or has already been used. Return to KosMore Settings.");
			let r = new URLSearchParams(e).getAll("state");
			if (r.length !== 1 || r[0] !== t.state) throw Error("This callback does not match the link from KosMore Settings.");
			await M();
			let i = d ??= new AbortController();
			return {
				link: t,
				signal: AbortSignal.any([i.signal, o.signal])
			};
		});
		return oe(t, chrome.identity.getRedirectURL("kosmore-services") + "?" + e, r);
	}
	async function oe(t, n, r) {
		let { target: i, verifier: a, state: o } = t, s = chrome.identity.getRedirectURL("kosmore-services"), c = new URL(n), l = c.searchParams.get("code");
		if (c.origin + c.pathname !== s || c.hash || c.searchParams.getAll("state").length !== 1 || c.searchParams.get("state") !== o) throw Error("Kosmora returned an invalid account-linking callback.");
		let u = c.searchParams.get("error");
		if (u === "whitelist_required") throw Error("Approval required. Enter a tester invite or ask the administrator for access.");
		if (u === "invite_unavailable") throw Error("This invite is unavailable. Ask the administrator for a new code.");
		if (!l || c.searchParams.has("error") || c.searchParams.getAll("code").length !== 1) throw Error("Kosmora account linking was declined or failed.");
		let d = await k(i, "/v1/connect/exchange", r, void 0, {
			code: l,
			handoffVerifier: a
		});
		if (!d.ok) throw Error(`Services could not complete account linking (HTTP ${d.status}).`);
		let f = e(await d.json()), p = f.accessToken, m = Date.parse(String(f.expiresAtUtc));
		if (typeof p != "string" || !p || !Number.isFinite(m) || m <= Date.now()) throw Error("Services returned an invalid session.");
		let h = await k(i, "/v1/me", r, p);
		if (!h.ok) throw Error(`Services could not verify the linked account (HTTP ${h.status}).`);
		let g = e(await h.json());
		if (typeof g.id != "string" || !/^[a-f0-9]{24}$/.test(g.id)) throw Error("Services returned an invalid player identity.");
		r.throwIfAborted();
		let _ = g.id;
		return C(async () => (r.throwIfAborted(), await O(i, {
			token: p,
			expiresAt: m,
			scopes: Array.isArray(f.scopes) ? f.scopes : void 0,
			playerId: _,
			handle: typeof g.handle == "string" ? g.handle : void 0
		}), T.schedule(), E()));
	}
	let L = (e, t) => JSON.stringify([e, t]), R = (e, t, n) => JSON.stringify([
		e,
		t,
		n
	]);
	async function z(e, r) {
		let i = a, s = n, c = o.signal, { retention: l, freshness: u } = await w, d = await t.get("cards", L(s, e)), f = (r && i && !i.blocked && i.handle?.toLowerCase() === r && i.expiresAt > Date.now() ? await Promise.all(["all", e].map((e) => t.get("listings", R(s, i.playerId, e)))) : []).filter((e) => !!e && (e.freshUntil ?? 0) > Date.now()).sort((e, t) => (t.startedAt ?? t.fetchedAt) - (e.startedAt ?? e.fetchedAt))[0];
		c.throwIfAborted();
		let p = Date.now(), m = d ? Math.min(d.fetchedAt + u, d.freshUntil) : 0, h = f?.listings.filter((t) => t.subjectId === e && Date.parse(t.endsAt) > p);
		return !d || d.fetchedAt <= p - l || d.missing && m <= p ? {
			stale: !0,
			until: 0,
			listings: h,
			listingsAsOf: f?.startedAt ?? f?.fetchedAt,
			listingsUntil: f?.freshUntil,
			accessBlocked: i?.blocked
		} : {
			accessBlocked: i?.blocked,
			fetchedAt: d.fetchedAt,
			card: d.card,
			missing: d.missing,
			stale: m <= p,
			until: m,
			listings: h,
			listingsAsOf: f?.startedAt ?? f?.fetchedAt,
			listingsUntil: f?.freshUntil
		};
	}
	function B(e, t) {
		let n = e && /^\d+$/.test(e) ? Number(e) * 1e3 : e ? Date.parse(e) - Date.now() : typeof t == "number" && Number.isFinite(t) ? t * 1e3 : 15e3;
		return Math.max(1e3, Number.isFinite(n) ? n : 15e3);
	}
	async function V(e, t) {
		let n = await chrome.tabs.query({ url: "https://kosmora.io/*" });
		for (let r = 0; r < e.length; r += 100) {
			let i = {
				op: "servicesCardsChanged",
				ids: e.slice(r, r + 100),
				firstFetchedAt: t
			};
			await Promise.allSettled(n.flatMap((e) => e.id === void 0 ? [] : [chrome.tabs.sendMessage(e.id, i, { frameId: 0 })]));
		}
	}
	async function H(e, t, n, r) {
		return e.status !== 401 && e.status !== 403 ? !1 : (await C(async () => {
			!r.aborted && a === n && await O(t, e.status === 403 ? {
				...n,
				blocked: !0
			} : void 0);
		}), !0);
	}
	async function se(r) {
		let i = a, s = n, c = o.signal;
		if (!i || !r || i.handle?.toLowerCase() !== r || i.blocked || i.expiresAt <= Date.now() || i.scopes && !i.scopes.includes("listings")) return;
		let l = R(s, i.playerId, "all"), u = await t.get("listings", l);
		if (c.throwIfAborted(), (u?.freshUntil ?? 0) > Date.now() || Math.max(_, m) > Date.now()) return;
		if (g) return g;
		let d = (async () => {
			let n = Date.now(), r = await k(s, "/v1/me/listings", c, i.token);
			if (r.status === 403 && (await r.clone().json().catch(() => ({})))?.error === "scope_missing") {
				await C(async () => {
					!c.aborted && a === i && await O(s, {
						...i,
						scopes: (i.scopes ?? ["identity"]).filter((e) => e !== "listings")
					});
				});
				return;
			}
			if (await H(r, s, i, c)) return;
			if (!r.ok) {
				_ = Date.now() + B(r.headers.get("Retry-After")), r.status === 429 && (m = _);
				return;
			}
			let o = e(await r.json()).auctions;
			if (!Array.isArray(o)) throw Error("Invalid listing snapshot.");
			let d = o.flatMap((t) => {
				let n = e(e(t).card).id;
				if (!P(n)) throw Error("Invalid listing card.");
				return ie([t], n).map((e) => ({
					...e,
					subjectId: n
				}));
			}), f = Date.now(), p = Date.parse(r.headers.get("X-KosMore-Fresh-Until") ?? "");
			await t.save([], [{
				key: l,
				startedAt: n,
				fetchedAt: f,
				freshUntil: Number.isFinite(p) ? p : f + 6e4,
				listings: d
			}], c);
			let h = new Set([...u?.listings ?? [], ...d].flatMap((e) => e.subjectId ? [e.subjectId] : []));
			h.size && V([...h], {}).catch(() => {});
		})().catch((e) => {
			throw c.aborted || (_ = Date.now() + 15e3), e;
		}).finally(() => {
			g === d && (g = void 0);
		});
		return g = d, d;
	}
	async function U(n, r, i, a, o) {
		let s = Date.now(), c = await k(r, "/v1/cards/details", a, i.token, {
			ids: n,
			includeMyListings: o,
			...o && { preferScopedBatch: !0 }
		});
		if (await H(c, r, i, a)) return;
		if (!c.ok) {
			m = Date.now() + B(c.headers.get("Retry-After"));
			return;
		}
		let l = e(await c.json());
		if (o && l.myListingsStatus === "scope-missing" && (_ = i.expiresAt), !Array.isArray(l.cards)) throw Error("Invalid Services batch.");
		a.throwIfAborted();
		let u = new Set(n), d = [], f = {}, p = [], g = [], v = /* @__PURE__ */ new Set(), y = Date.now(), b = y + B(c.headers.get("Retry-After"), l.retryAfterSeconds);
		for (let n of l.cards) try {
			let a = e(n), c = a.id;
			if (!P(c) || !u.delete(c)) continue;
			if (o && l.myListingsStatus === "fresh" && Array.isArray(a.myListings)) {
				let e = Date.parse(String(l.myListingsFreshUntilUtc));
				v.add(c), g.push({
					key: R(r, i.playerId, c),
					startedAt: s,
					fetchedAt: y,
					freshUntil: Number.isFinite(e) ? e : y + 6e4,
					listings: ie(a.myListings, c).map((e) => ({
						...e,
						subjectId: c
					}))
				});
			}
			if (o && l.myListingsStatus === "unavailable" && (_ = Math.max(_, b)), a.status !== "fresh" && a.status !== "stale" && a.status !== "notFound") {
				h.set(c, b);
				continue;
			}
			let m = Date.parse(String(a.fetchedAtUtc)), x = Date.parse(String(a.freshUntilUtc));
			if (!Number.isFinite(m) || !Number.isFinite(x) || x < m) throw Error("Invalid Services cache timestamps.");
			a.status === "stale" && h.set(c, b);
			let S = L(r, c), C = await t.get("cards", S);
			if (C && (C.fetchedAt > m || C.fetchedAt === m && C.freshUntil >= x)) continue;
			let w = a.status === "notFound" ? {
				key: S,
				fetchedAt: m,
				freshUntil: x,
				missing: !0
			} : {
				key: S,
				fetchedAt: m,
				freshUntil: a.status === "stale" ? Math.min(x, y) : x,
				card: re(a.details, c)
			};
			p.push(w), d.push(c), C || (f[c] = m);
		} catch {
			P(n?.id) && h.set(n.id, b);
		}
		for (let e of u) h.set(e, b);
		a.throwIfAborted(), await t.save(p, g, a), a.throwIfAborted();
		let x = [.../* @__PURE__ */ new Set([...d, ...v])];
		x.length && V(x, f).catch(() => {});
	}
	async function ce() {
		u = !0;
		try {
			for (; c.size;) {
				let e = [...c.values()][0].privateDemand, t = [...c].filter(([, t]) => t.privateDemand === e).slice(0, Ge), r = a, i = o.signal, s = n;
				try {
					let n = t.find(([, e]) => e.batchCandidates)?.[1].batchCandidates, a = n && t.length < Ge ? await W(n, s) : [];
					i.throwIfAborted(), y && v.add(y);
					for (let n of a.length ? /* @__PURE__ */ new Set([...a, ...v]) : v) {
						if (t.length === Ge) break;
						v.delete(n), c.has(n) || (h.get(n) ?? 0) > Date.now() || (ue(n, e), t.push([n, c.get(n)]));
					}
					if (y && t.some(([e]) => e === y) && await D(), i.throwIfAborted(), r && !r.blocked && r.expiresAt > Date.now() && m <= Date.now()) {
						let n = await W(t.map(([e]) => e), s);
						i.throwIfAborted(), n.length && await U(n, s, r, i, e);
					}
				} catch {
					i.aborted || (m = Date.now() + 15e3);
				} finally {
					for (let [e, n] of t) c.get(e) === n && c.delete(e), n.resolve();
				}
			}
		} finally {
			u = !1;
		}
	}
	function le(e, t, n) {
		if (!(!a || a.blocked || a.expiresAt <= Date.now() || m > Date.now() || (h.get(e) ?? 0) > Date.now())) return v.delete(e), ue(e, t, n);
	}
	function ue(e, t, n) {
		let r = c.get(e);
		if (r) return r.privateDemand ||= t, r.batchCandidates ??= n, r.promise;
		let i, a = new Promise((e) => {
			i = e;
		});
		return c.set(e, {
			promise: a,
			resolve: i,
			privateDemand: t,
			batchCandidates: n
		}), !u && p === void 0 && (p = setTimeout(() => {
			p = void 0, ce().catch(() => {});
		}, 35)), a;
	}
	async function W(e, n) {
		let { freshness: r } = await w, i = await t.getCards(e.map((e) => L(n, e))), a = Date.now();
		return e.filter((e, t) => {
			let n = i[t];
			return !n || Math.min(n.freshUntil, n.fetchedAt + r) <= a;
		});
	}
	async function de(e, r, i, l = !1, u = !1, d) {
		if (a && a.expiresAt <= Date.now() && await C(async () => {
			a && a.expiresAt <= Date.now() && await O(n);
		}), !n) return {};
		let f = o.signal;
		if (i) {
			if (!a || a.blocked) return {};
			let t = await W([...new Set(e)], n);
			f.throwIfAborted();
			for (let e of t) c.has(e) || (v.add(e), v.size > 500 && v.delete(v.values().next().value));
			return !y && v.size && await D(v.values().next().value), {};
		}
		let { retention: p } = await w, m = Date.now();
		if (m - s >= 36e5) {
			s = m;
			for (let [e, t] of h) t <= m && h.delete(e);
			t.prune(m - p).catch(() => {});
		}
		let g = {};
		return await Promise.all([...new Set(e)].map(async (e) => {
			let t = await z(e, r);
			f.throwIfAborted();
			let n = u && r !== void 0 && a?.handle?.toLowerCase() === r && !a.blocked && (!a.scopes || a.scopes.includes("listings")) && t.listings === void 0;
			if (t.stale && !l) {
				let i = le(e, n && _ <= Date.now(), d);
				(n || !t.card) && (await i, f.throwIfAborted(), t = await z(e, r));
			}
			if (n && !t.missing && t.listings === void 0) {
				try {
					await se(r);
				} catch (e) {
					if (!t.card || f.aborted) throw e;
				}
				f.throwIfAborted(), t = await z(e, r);
			}
			g[e] = t;
		})), f.throwIfAborted(), g;
	}
	return chrome.runtime.onMessage.addListener((e, s, c) => {
		if (s.id !== chrome.runtime.id || !e || typeof e.requestId != "string") return !1;
		let u = s.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL("options.html"), f = s.frameId === 0 && s.tab && s.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL("link-complete.html"), p = s.tab && s.frameId === 0 && s.url?.startsWith("https://kosmora.io/");
		return !(u && [
			"servicesStatus",
			"servicesRetry",
			"servicesSave",
			"servicesConnect",
			"servicesCopyLink",
			"servicesDisconnect",
			"servicesEraseHistory"
		].includes(e.op)) && !(f && e.op === "servicesFinishLink") && !(p && [
			"servicesRead",
			"servicesObserve",
			"servicesPeek"
		].includes(e.op)) ? !1 : (x.then(async () => {
			switch (e.op) {
				case "servicesStatus": return a && a.expiresAt <= Date.now() && await C(async () => {
					a && a.expiresAt <= Date.now() && await O(n);
				}), E();
				case "servicesRetry": return C(async () => {
					let e = a;
					if (!e?.blocked) return E();
					let t = await k(n, "/v1/me", o.signal, e.token);
					if (t.status === 401) await O(n);
					else if (t.ok) await O(n, {
						...e,
						blocked: !1
					});
					else if (t.status !== 403) throw Error("Services is temporarily unavailable.");
					return E();
				});
				case "servicesSave": {
					if (typeof e.base != "string") throw Error("Invalid Services URL.");
					let o = e.base ? F(e.base) : r;
					return o !== n && d?.abort(), C(async () => {
						let e = o === r;
						return o === n ? i !== e && (await t.saveConnection({
							base: n,
							session: a,
							usesDefault: e
						}, !1), i = e) : await O(o, void 0, e), E();
					});
				}
				case "servicesFinishLink":
					if (typeof e.query != "string" || e.query.length > 1024) throw Error("Invalid account-linking callback.");
					return ae(e.query);
				case "servicesConnect":
				case "servicesCopyLink":
					if (typeof e.base != "string") throw Error("Invalid Services URL.");
					return I(e.base, typeof e.inviteCode == "string" ? e.inviteCode : void 0, e.op === "servicesCopyLink");
				case "servicesEraseHistory":
					if (typeof e.playerId != "string" || typeof e.base != "string") throw Error("Confirm the linked account.");
					return await T.erase(e.playerId, e.base), E();
				case "servicesDisconnect": return d?.abort(), C(async () => {
					let e = a, t = n;
					if (await O(t), e && e.expiresAt > Date.now()) {
						let n = await k(t, "/v1/disconnect", o.signal, e.token, {});
						if (!n.ok && n.status !== 401) throw Error("Disconnected locally. Services could not revoke the previous session.");
					}
					return E();
				});
				default:
					if (!Array.isArray(e.ids) || e.ids.length > 500 || !e.ids.every(P)) throw Error("Invalid card request.");
					return de(e.ids, typeof e.account == "string" && /^[a-z0-9_]{1,24}$/.test(e.account) ? e.account : void 0, e.op === "servicesObserve", e.op === "servicesPeek", e.op === "servicesRead" && e.includeMyListings === !0, e.op === "servicesRead" && Array.isArray(e.batchCandidates) && e.batchCandidates.length <= 500 && e.batchCandidates.every(P) ? e.batchCandidates : void 0);
			}
		}).then((t) => c({
			requestId: e.requestId,
			ok: !0,
			data: t
		}), (t) => c({
			requestId: e.requestId,
			ok: !1,
			error: l(t)
		})), !0);
	}), T;
}
// src/background.ts
Ie(Je());
var Ye = Promise.resolve();
chrome.tabs.onZoomChange.addListener(({ tabId: e, newZoomFactor: t }) => {
	chrome.tabs.sendMessage(e, {
		op: "browserZoomChanged",
		zoom: t
	}).catch(() => {});
}), chrome.tabs.onRemoved.addListener((e) => {
	chrome.storage.session.remove([`${k}${e}`, `${j}${e}`]);
}), chrome.action.onClicked.addListener(() => {
	chrome.runtime.openOptionsPage();
}), chrome.runtime.onMessage.addListener((e, t, n) => {
	if (t.id !== chrome.runtime.id || !V(e)) return !1;
	let r = t.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL("options.html"), i = !!t.tab && t.url?.startsWith("https://kosmora.io/");
	if (e.op === "browserZoom" && i && t.tab?.id !== void 0) return chrome.tabs.getZoom(t.tab.id).then((t) => n({
		requestId: e.requestId,
		ok: !0,
		data: t
	}), (t) => n({
		requestId: e.requestId,
		ok: !1,
		error: l(t)
	})), !0;
	if ((e.op === "popupState" || e.op === "popupLayout" || e.op === "friendPopupState" || e.op === "friendPopupLayout") && i && t.tab?.id !== void 0 && t.frameId === 0) {
		let r = e.op === "friendPopupState" || e.op === "friendPopupLayout", i = `${r ? j : k}${t.tab.id}`, a = Ye.then(async () => {
			let t = N((await chrome.storage.session.get(i))[i]), n = r ? t : {
				...N((await chrome.storage.local.get(A))[A]),
				tab: t.tab
			};
			if (e.op === "popupState" || e.op === "friendPopupState") return n;
			let a = e.change;
			if (a.tab !== void 0 && (n.tab = a.tab), a.pinned !== void 0 && (n.pinned = a.pinned), a.position && (n.position = M(a.position)), (r || a.tab !== void 0) && await chrome.storage.session.set({ [i]: r ? n : { tab: n.tab } }), !r && (a.pinned !== void 0 || a.position) && await chrome.storage.local.set({ [A]: {
				pinned: n.pinned,
				position: n.position
			} }), a.position || a.width !== void 0 || a.height !== void 0) {
				let e = await Oe();
				a.position && (e[r ? "friendTooltipPosition" : "popupPosition"] = M(a.position)), a.width !== void 0 && (e[r ? "friendTooltipWidth" : "popupWidth"] = Math.round(a.width)), a.height !== void 0 && (e[r ? "friendTooltipHeight" : "popupHeight"] = Math.round(a.height)), await ke(e);
			}
			return n;
		});
		return Ye = a.then(() => {}, () => {}), a.then((t) => n({
			requestId: e.requestId,
			ok: !0,
			data: t
		}), (t) => n({
			requestId: e.requestId,
			ok: !1,
			error: l(t)
		})), !0;
	}
	return e.op === "openOptions" && i ? ((e.section ? chrome.tabs.create({ url: chrome.runtime.getURL("options.html#stat-boxes") }) : chrome.runtime.openOptionsPage()).then(() => n({
		requestId: e.requestId,
		ok: !0,
		data: null
	}), (t) => n({
		requestId: e.requestId,
		ok: !1,
		error: l(t)
	})), !0) : r ? ((async () => {
		if (e.op === "sessions") {
			let t = await chrome.tabs.query({ url: "https://kosmora.io/*" });
			return (await Promise.allSettled(t.filter((e) => e.id !== void 0).map(async (t) => {
				let n = await chrome.tabs.sendMessage(t.id, {
					requestId: e.requestId,
					op: "session"
				});
				if (!n?.ok || n.requestId !== e.requestId) throw Error("Game tab unavailable.");
				return {
					tabId: t.id,
					account: n.data
				};
			}))).flatMap((e) => e.status === "fulfilled" ? [e.value] : []);
		}
		if (e.op === "albums" || e.op === "families") {
			if (!(await chrome.tabs.get(e.tabId)).url?.startsWith("https://kosmora.io/")) throw Error("Choose a Kosmora tab.");
			let t = await chrome.tabs.sendMessage(e.tabId, {
				requestId: e.requestId,
				op: e.op === "families" ? "listFamilies" : "listAlbums",
				accountKey: e.accountKey
			});
			if (!t?.ok || t.requestId !== e.requestId) throw Error(t && !t.ok ? t.error : "The game tab is unavailable.");
			return t.data;
		}
		throw Error("Unsupported request.");
	})().then((t) => n({
		requestId: e.requestId,
		ok: !0,
		data: t
	}), (t) => n({
		requestId: e.requestId,
		ok: !1,
		error: l(t)
	})), !0) : !1;
});

//# sourceMappingURL=background.js.map