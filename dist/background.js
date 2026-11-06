// src/shared/popup-layout.ts
var e = "kosmore.popup.", t = "kosmore.friendPopup.";
function n(e) {
	if (!e || typeof e != "object") return null;
	let t = e;
	return [t.left, t.top].every((e) => typeof e == "number" && Number.isFinite(e) && e >= 0 && e <= 1e5) ? {
		left: Math.round(t.left),
		top: Math.round(t.top)
	} : null;
}
function r(e) {
	if (!e || typeof e != "object") return {
		pinned: !1,
		position: null
	};
	let t = e;
	return {
		pinned: t.pinned === !0,
		position: n(t.position)
	};
}
function i(e, t = {
	minWidth: 320,
	minHeight: 480
}) {
	if (!e || typeof e != "object" || Array.isArray(e)) return !1;
	let r = e;
	return Object.keys(r).every((e) => [
		"pinned",
		"position",
		"width",
		"height"
	].includes(e)) && (r.pinned === void 0 || typeof r.pinned == "boolean") && (r.position === void 0 || n(r.position) !== null) && (r.width === void 0 || Number.isFinite(r.width) && r.width >= t.minWidth && r.width <= 1200) && (r.height === void 0 || Number.isFinite(r.height) && r.height >= t.minHeight && r.height <= 1600);
}
// src/shared/messages.ts
var a = (e) => typeof e == "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(e);
function o(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return a(t.requestId) && ([
		"sessions",
		"openOptions",
		"popupState",
		"friendPopupState"
	].includes(t.op) || t.op === "popupLayout" && i(t.change) || t.op === "friendPopupLayout" && i(t.change, {
		minWidth: 240,
		minHeight: 160
	}) || t.op === "albums" && Number.isInteger(t.tabId) && t.tabId >= 0 && /^[a-z0-9_]{1,24}$/.test(t.accountKey));
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
// src/shared/stat-catalog.ts
var f = [
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
	},
	{
		id: "activeAuctions",
		label: "Active Auctions",
		description: "Open, unexpired market listings for this card across all finishes.",
		source: "auctions",
		preview: { value: "7" },
		read: (e) => ({
			value: typeof e.activeAuctions == "number" ? e.activeAuctions.toLocaleString() : "—",
			title: e.activeAuctions instanceof Error ? e.activeAuctions.message : typeof e.activeAuctions == "number" ? "Active listings for this exact card across all finishes. Counts are cached for up to 30 seconds; Refresh checks again." : e.cardError ?? "Loading active auctions…"
		})
	},
	{
		id: "saleRate",
		label: "Sale Rate · 30 days",
		description: "Share of this card's observed listings that sold, for the selected variants. Kosmora does not report unsold listings, so KosMore records the listings the Market shows you and settles them from sale histories.",
		source: "observed",
		preview: { value: "67% · 3" },
		read: (e) => p(e)
	}
];
function p(e) {
	if (!e.saleRates) return {
		value: "—",
		title: "Loading card details…"
	};
	let t = d(e.saleRates, e.finishes), n = `${s.filter((t) => e.finishes.includes(t)).map((t) => {
		let n = e.saleRates[t];
		return `${c[t]}: ${n.total ? `${n.sold} of ${n.total} sold` : "none observed"}`;
	}).join(" · ")}. Observed locally from listings KosMore saw on the Market, settled from sale histories. Listings ended in the last 30 days.`;
	return t.percent === null ? {
		value: "—",
		title: n
	} : {
		value: `${t.percent}% · ${t.total}`,
		title: n
	};
}
var m = () => f.map(({ id: e }) => ({
	id: e,
	enabled: !0
}));
function h(e) {
	if (!Array.isArray(e)) return m();
	let t = new Map(f.map((e) => [e.id, e])), n = /* @__PURE__ */ new Set(), r = [];
	for (let i of e) {
		if (!i || typeof i != "object") continue;
		let { id: e, enabled: a } = i;
		e && t.has(e) && !n.has(e) && (n.add(e), r.push({
			id: e,
			enabled: typeof a != "boolean" || a
		}));
	}
	return [...r, ...m().filter((e) => !n.has(e.id))];
}
// src/shared/hotkeys.ts
var g = [
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
function _(e) {
	return `${e.ctrl}-${e.alt}-${e.shift}-${e.meta}-${e.code}`;
}
function v(e) {
	let t = {}, n = /* @__PURE__ */ new Set();
	if (!e || typeof e != "object") return t;
	let r = e;
	for (let e of g) {
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
		}, s = _(o);
		n.has(s) || (n.add(s), t[e.id] = o);
	}
	return t;
}
// src/shared/sales-prices.ts
function y(e) {
	if (typeof e != "number" || !Number.isFinite(e)) return;
	let t = String(e).match(/^(-?)(\d+)(?:\.(\d{1,6}))?$/);
	if (!t) return;
	let n = BigInt(t[2]) * 1000000n + BigInt((t[3] ?? "").padEnd(6, "0"));
	if (!(n > BigInt(2 ** 53 - 1))) return t[1] ? -n : n;
}
function b(e) {
	return y(e) !== void 0;
}
// src/shared/settings.ts
var x = "kosmore.settings", S = () => ({
	schemaVersion: 1,
	enabled: !0,
	profileRemindersEnabled: !0,
	profileRemindersPinned: !1,
	friendTooltipEnabled: !0,
	friendHoverDelayMs: 300,
	friendDismissDelayMs: 200,
	friendTooltipWidth: 320,
	friendTooltipHeight: 560,
	friendTooltipPosition: null,
	navigationHotkeysEnabled: !0,
	cardOverlaysEnabled: !0,
	salesOverlaysEnabled: !0,
	showSalesLastSale: !0,
	salesLastSaleSetsPrice: !0,
	salesLastSaleAdjustment: 0,
	showSalesLowestListing: !0,
	salesLowestListingSetsPrice: !0,
	salesLowestListingAdjustment: 0,
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
	showActiveAuctionsOverlay: !0,
	showLowestListingPriceOverlay: !0,
	showOnSaleOverlay: !0,
	showFriendInterestOverlay: !0,
	showQuestOverlay: !0,
	stats: m(),
	hotkeys: {},
	pinnedAlbums: {}
});
function C(e) {
	let t = S();
	if (!e || typeof e != "object") return t;
	let r = e;
	if (r.schemaVersion !== 1) return t;
	t.stats = h(r.stats), t.hotkeys = v(r.hotkeys), t.popupPosition = n(r.popupPosition), t.friendTooltipPosition = n(r.friendTooltipPosition), typeof r.enabled == "boolean" && (t.enabled = r.enabled);
	for (let e of [
		"profileRemindersEnabled",
		"profileRemindersPinned",
		"friendTooltipEnabled",
		"navigationHotkeysEnabled",
		"cardOverlaysEnabled",
		"salesOverlaysEnabled",
		"showSalesLastSale",
		"salesLastSaleSetsPrice",
		"showSalesLowestListing",
		"salesLowestListingSetsPrice",
		"statBoxesEnabled",
		"pinnedAlbumsEnabled"
	]) typeof r[e] == "boolean" && (t[e] = r[e]);
	for (let e of ["salesLastSaleAdjustment", "salesLowestListingAdjustment"]) b(r[e]) && (t[e] = r[e]);
	typeof r.closeTooltipWhenAddedToAlbum == "boolean" && (t.closeTooltipWhenAddedToAlbum = r.closeTooltipWhenAddedToAlbum), typeof r.applyCloseBehaviorToPinnedTooltips == "boolean" && (t.applyCloseBehaviorToPinnedTooltips = r.applyCloseBehaviorToPinnedTooltips), typeof r.showSaleHistoryOverlay == "boolean" && (t.showSaleHistoryOverlay = r.showSaleHistoryOverlay), typeof r.showLastSalePriceOverlay == "boolean" && (t.showLastSalePriceOverlay = r.showLastSalePriceOverlay), typeof r.showActiveAuctionsOverlay == "boolean" && (t.showActiveAuctionsOverlay = r.showActiveAuctionsOverlay), typeof r.showLowestListingPriceOverlay == "boolean" && (t.showLowestListingPriceOverlay = r.showLowestListingPriceOverlay), typeof r.showOnSaleOverlay == "boolean" && (t.showOnSaleOverlay = r.showOnSaleOverlay), typeof r.showFriendInterestOverlay == "boolean" && (t.showFriendInterestOverlay = r.showFriendInterestOverlay), typeof r.showQuestOverlay == "boolean" && (t.showQuestOverlay = r.showQuestOverlay), typeof r.hoverDelayMs == "number" && Number.isFinite(r.hoverDelayMs) && (t.hoverDelayMs = Math.min(2e3, Math.max(100, Math.round(r.hoverDelayMs))));
	for (let [e, n, i] of [
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
			"popupHeight",
			480,
			1600
		]
	]) {
		let a = r[e];
		typeof a == "number" && Number.isFinite(a) && (t[e] = Math.min(i, Math.max(n, Math.round(a))));
	}
	if (r.pinnedAlbums && typeof r.pinnedAlbums == "object") for (let [e, n] of Object.entries(r.pinnedAlbums)) /^[a-z0-9_]{1,24}$/.test(e) && Array.isArray(n) && Object.defineProperty(t.pinnedAlbums, e, {
		enumerable: !0,
		configurable: !0,
		writable: !0,
		value: [...new Set(n.filter((e) => typeof e == "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(e)))].slice(0, 200)
	});
	return t;
}
async function w() {
	return C((await chrome.storage.local.get(x))[x]);
}
async function T(e) {
	await chrome.storage.local.set({ [x]: C(e) });
}
// src/background.ts
var E = Promise.resolve();
chrome.tabs.onRemoved.addListener((n) => {
	chrome.storage.session.remove([`${e}${n}`, `${t}${n}`]);
}), chrome.action.onClicked.addListener(() => {
	chrome.runtime.openOptionsPage();
}), chrome.runtime.onMessage.addListener((i, a, s) => {
	if (a.id !== chrome.runtime.id || !o(i)) return !1;
	let c = a.url === chrome.runtime.getURL("options.html"), u = !!a.tab && a.url?.startsWith("https://kosmora.io/");
	if ((i.op === "popupState" || i.op === "popupLayout" || i.op === "friendPopupState" || i.op === "friendPopupLayout") && u && a.tab?.id !== void 0 && a.frameId === 0) {
		let o = i.op === "friendPopupState" || i.op === "friendPopupLayout", c = `${o ? t : e}${a.tab.id}`, u = E.then(async () => {
			let e = r((await chrome.storage.session.get(c))[c]);
			if (i.op === "popupState" || i.op === "friendPopupState") return e;
			let t = i.change;
			if (t.pinned !== void 0 && (e.pinned = t.pinned), t.position && (e.position = n(t.position)), await chrome.storage.session.set({ [c]: e }), t.position || t.width !== void 0 || t.height !== void 0) {
				let e = await w();
				t.position && (e[o ? "friendTooltipPosition" : "popupPosition"] = n(t.position)), t.width !== void 0 && (e[o ? "friendTooltipWidth" : "popupWidth"] = Math.round(t.width)), t.height !== void 0 && (e[o ? "friendTooltipHeight" : "popupHeight"] = Math.round(t.height)), await T(e);
			}
			return e;
		});
		return E = u.then(() => {}, () => {}), u.then((e) => s({
			requestId: i.requestId,
			ok: !0,
			data: e
		}), (e) => s({
			requestId: i.requestId,
			ok: !1,
			error: l(e)
		})), !0;
	}
	return i.op === "openOptions" && u ? (chrome.runtime.openOptionsPage().then(() => s({
		requestId: i.requestId,
		ok: !0,
		data: null
	})), !0) : c ? ((async () => {
		if (i.op === "sessions") {
			let e = await chrome.tabs.query({ url: "https://kosmora.io/*" });
			return (await Promise.allSettled(e.filter((e) => e.id !== void 0).map(async (e) => {
				let t = await chrome.tabs.sendMessage(e.id, {
					requestId: i.requestId,
					op: "session"
				});
				if (!t?.ok || t.requestId !== i.requestId) throw Error("Game tab unavailable.");
				return {
					tabId: e.id,
					account: t.data
				};
			}))).flatMap((e) => e.status === "fulfilled" ? [e.value] : []);
		}
		if (i.op === "albums") {
			if (!(await chrome.tabs.get(i.tabId)).url?.startsWith("https://kosmora.io/")) throw Error("Choose a Kosmora tab.");
			let e = await chrome.tabs.sendMessage(i.tabId, {
				requestId: i.requestId,
				op: "listAlbums",
				accountKey: i.accountKey
			});
			if (!e?.ok || e.requestId !== i.requestId) throw Error(e && !e.ok ? e.error : "The game tab is unavailable.");
			return e.data;
		}
		throw Error("Unsupported request.");
	})().then((e) => s({
		requestId: i.requestId,
		ok: !0,
		data: e
	}), (e) => s({
		requestId: i.requestId,
		ok: !1,
		error: l(e)
	})), !0) : !1;
});

//# sourceMappingURL=background.js.map