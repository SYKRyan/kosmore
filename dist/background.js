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
	let n = t(e);
	if (!/^\d{1,18}$/.test(n)) throw Error("Invalid card identifier.");
	return BigInt(n).toString();
}
function r(e) {
	let n = t(e);
	if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(n)) throw Error("Invalid copy or album identifier.");
	return n;
}
function i(e) {
	let n = t(e);
	if (!/^\d+$/.test(n)) throw Error("Invalid market price.");
	return n;
}
function a(e) {
	let n = t(e);
	if (!Number.isFinite(Date.parse(n))) throw Error("Invalid sale date.");
	return n;
}
// src/shared/types.ts
var o = [
	"plain",
	"veil",
	"fullart"
], s = {
	plain: "Standard",
	veil: "Shiny",
	fullart: "Full art"
};
function c(e) {
	return e instanceof Error ? e.message : "The request failed. Please try again.";
}
// src/shared/sale-observations.ts
var l = (e, t) => ({
	sold: e,
	total: t,
	percent: t ? Math.round(e / t * 100) : null
});
function u(e, t) {
	let n = 0, r = 0;
	for (let i of t) n += e[i].sold, r += e[i].total;
	return l(n, r);
}
// src/kosmora/my-listings.ts
var d = [
	"selling",
	"sold",
	"unsold"
], f = () => ({
	selling: 50,
	sold: 50,
	unsold: 50
});
function p(o) {
	try {
		let s = e(o);
		return r(s.id), n(s.subjectId), a(s.endsAt), i(s.startPrice), t(s.state), d.includes(s.group) && [
			"plain",
			"veil",
			"fullart"
		].includes(String(s.finish));
	} catch {
		return !1;
	}
}
function m(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return h(t.limits) && Array.isArray(t.listings) && t.listings.every(p) && [t.totals, t.counts].every((e) => e && d.every((t) => Number.isSafeInteger(e[t]) && e[t] >= 0)) && Number.isFinite(t.fetchedAt) && t.fetchedAt >= 0;
}
function h(e) {
	return !e || typeof e != "object" ? !1 : d.every((t) => {
		let n = e[t];
		return Number.isInteger(n) && n >= 1 && n <= 1e6;
	});
}
var g = (e) => d.every((t) => e.counts[t] >= e.totals[t]);
function _(e, t) {
	return d.filter((n) => e.counts[n] < e.totals[n] && !e.listings.some((e) => e.subjectId === t && e.group === n));
}
function v(e, t = d) {
	let n = { ...e.limits };
	for (let r of t) if (e.counts[r] < e.totals[r] && (n[r] = Math.min(e.totals[r], Math.max(n[r] * 2, 50)), n[r] <= e.limits[r])) throw Error("Your listing history stopped before all auctions were returned.");
	return n;
}
// src/shared/popup-layout.ts
function y(e) {
	return e === "market" || e === "history" || e === "trade" || e === "notes";
}
var b = "kosmore.popup.", x = "kosmore.friendPopup.";
function S(e) {
	if (!e || typeof e != "object") return null;
	let t = e;
	return [t.left, t.top].every((e) => typeof e == "number" && Number.isFinite(e) && e >= 0 && e <= 1e5) ? {
		left: Math.round(t.left),
		top: Math.round(t.top)
	} : null;
}
function C(e) {
	if (!e || typeof e != "object") return {
		pinned: !1,
		position: null
	};
	let t = e;
	return {
		pinned: t.pinned === !0,
		position: S(t.position),
		...y(t.tab) ? { tab: t.tab } : {}
	};
}
function w(e, t = {
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
	].includes(e)) && (n.tab === void 0 || y(n.tab)) && (n.pinned === void 0 || typeof n.pinned == "boolean") && (n.position === void 0 || S(n.position) !== null) && (n.width === void 0 || Number.isFinite(n.width) && n.width >= t.minWidth && n.width <= 1200) && (n.height === void 0 || Number.isFinite(n.height) && n.height >= t.minHeight && n.height <= 1600);
}
// src/shared/messages.ts
var T = (e) => typeof e == "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(e);
function E(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return T(t.requestId) && ([
		"listingCache",
		"listingLatest",
		"listingInvalidate",
		"listingHistory"
	].includes(t.op) && "accountKey" in t && "subjectId" in t && /^[a-z0-9_]{1,24}$/.test(t.accountKey) && typeof t.subjectId == "string" && /^\d+$/.test(t.subjectId) && (t.op !== "listingHistory" || [
		"initial",
		"more",
		"refresh"
	].includes(t.mode) && (t.limits === void 0 || h(t.limits))) || t.op === "listingCancel" && T(t.target) || [
		"sessions",
		"openOptions",
		"popupState",
		"friendPopupState"
	].includes(t.op) || t.op === "popupLayout" && w(t.change) || t.op === "friendPopupLayout" && w(t.change, {
		minWidth: 240,
		minHeight: 160
	}) || (t.op === "albums" || t.op === "families") && Number.isInteger(t.tabId) && t.tabId >= 0 && /^[a-z0-9_]{1,24}$/.test(t.accountKey));
}
// src/shared/stat-catalog.ts
var D = [
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
		read: (e) => O(e)
	}
];
function O(e) {
	if (!e.saleRates) return {
		value: "—",
		title: "Loading card details…"
	};
	let t = u(e.saleRates, e.finishes), n = `${o.filter((t) => e.finishes.includes(t)).map((t) => {
		let n = e.saleRates[t];
		return `${s[t]}: ${n.total ? `${n.sold} of ${n.total} sold` : "none observed"}`;
	}).join(" · ")}. Observed locally from listings KosMore saw on the Market, settled from sale histories. Listings ended in the last 30 days.`;
	return t.percent === null ? {
		value: "—",
		title: n
	} : {
		value: `${t.percent}% · ${t.total}`,
		title: n
	};
}
var k = () => D.map(({ id: e }) => ({
	id: e,
	enabled: !0
}));
function A(e) {
	if (!Array.isArray(e)) return k();
	let t = new Map(D.map((e) => [e.id, e])), n = /* @__PURE__ */ new Set(), r = [];
	for (let i of e) {
		if (!i || typeof i != "object") continue;
		let { id: e, enabled: a } = i;
		e && t.has(e) && !n.has(e) && (n.add(e), r.push({
			id: e,
			enabled: typeof a != "boolean" || a
		}));
	}
	return [...r, ...k().filter((e) => !n.has(e.id))];
}
// src/shared/hotkeys.ts
var j = [
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
		id: "fusion",
		label: "Fusion",
		path: "/fusion"
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
], M = [
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
];
function N(e, t = !1) {
	return typeof e == "string" && (/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(e) || t && /^(Arrow(?:Up|Down|Left|Right)|Home|End)$/.test(e));
}
function P(e) {
	return `${e.ctrl}-${e.alt}-${e.shift}-${e.meta}-${e.code}`;
}
function F(e, t, n, r) {
	if (!e || typeof e != "object") return {};
	let i = e, a = [...Object.values(n), ...Object.values(r)].map(P);
	return Object.fromEntries(Object.entries(t).flatMap(([e, t]) => {
		if (!Object.hasOwn(i, e)) return [];
		let n = R(i[e], t.map((e) => ({
			id: e,
			label: e
		})), new Set(a));
		return Object.keys(n).length ? [[e, n]] : [];
	}));
}
function I(e) {
	return R(e, j);
}
function L(e, t) {
	return R(e, M, new Set(Object.values(t).map(P)), !0);
}
function R(e, t, n = /* @__PURE__ */ new Set(), r = !1) {
	let i = {};
	if (!e || typeof e != "object") return i;
	let a = e;
	for (let e of t) {
		let t = a[e.id];
		if (!t || typeof t != "object") continue;
		let o = t;
		if (!N(o.code, r) || ![
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
		}, c = P(s);
		n.has(c) || (n.add(c), i[e.id] = s);
	}
	return i;
}
// src/shared/sales-prices.ts
function z(e) {
	if (typeof e != "number" || !Number.isFinite(e)) return;
	let t = String(e).match(/^(-?)(\d+)(?:\.(\d{1,6}))?$/);
	if (!t) return;
	let n = BigInt(t[2]) * 1000000n + BigInt((t[3] ?? "").padEnd(6, "0"));
	if (!(n > BigInt(2 ** 53 - 1))) return t[1] ? -n : n;
}
function B(e) {
	return z(e) !== void 0;
}
function V(e, t = "per friend") {
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
var H = "kosmore.settings", U = () => ({
	schemaVersion: 1,
	enabled: !0,
	disableHoverTooltipInPulsar: !1,
	disableHoverTooltipInVortex: !1,
	useOverlayButtonInsteadOfHover: !1,
	outsideClickClosesTooltipOnly: !1,
	fullScreenCenteredOnOpen: !1,
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
	friendTooltipHeight: 560,
	friendTooltipPosition: null,
	navigationHotkeysEnabled: !0,
	packOpeningHotkeysEnabled: !1,
	anyKeyDismissesFoundPack: !0,
	autoSkipOpening: !1,
	autoDismissFoundPack: !1,
	showRemainingPackCount: !0,
	cardOverlaysEnabled: !0,
	disableCardOverlaysInPulsar: !1,
	disableCardOverlaysInVortex: !1,
	salesOverlaysEnabled: !0,
	showSalesLastSale: !0,
	salesLastSaleSetsPrice: !0,
	salesLastSaleAdjustment: 0,
	showSalesLowestListing: !0,
	salesLowestListingSetsPrice: !0,
	salesLowestListingAdjustment: 0,
	showSalesMyLastListing: !0,
	salesMyLastListingSetsPrice: !0,
	salesMyLastListingAdjustment: 0,
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
	familyImpactOverlaysEnabled: !0,
	useFamilyBlacklist: !1,
	familyBlacklist: [],
	showSalesFamilyOverlay: !0,
	showFusionFamilyOverlay: !0,
	showTradeFamilyOverlay: !0,
	showVortexFamilyOverlay: !0,
	stats: k(),
	hotkeys: {},
	packOpeningHotkeys: {},
	pinnedAlbums: {},
	pinnedAlbumHotkeys: {}
});
function W(e) {
	let t = U();
	if (!e || typeof e != "object") return t;
	let n = e;
	if (n.schemaVersion !== 1) return t;
	if (t.stats = A(n.stats), t.hotkeys = I(n.hotkeys), t.packOpeningHotkeys = L(n.packOpeningHotkeys, t.hotkeys), t.popupPosition = S(n.popupPosition), t.friendTooltipPosition = S(n.friendTooltipPosition), Array.isArray(n.familyBlacklist) && n.familyBlacklist.every((e) => typeof e == "string")) try {
		t.familyBlacklist = V(n.familyBlacklist, "in the family blacklist");
	} catch {}
	typeof n.enabled == "boolean" && (t.enabled = n.enabled);
	for (let e of /* @__PURE__ */ "disableHoverTooltipInPulsar.disableCardOverlaysInPulsar.disableHoverTooltipInVortex.disableCardOverlaysInVortex.useOverlayButtonInsteadOfHover.outsideClickClosesTooltipOnly.fullScreenCenteredOnOpen.socialRemindersMasterEnabled.profileRemindersEnabled.profileRemindersPinned.socialRemindersEnabled.socialRemindersPinned.tradeRemindersEnabled.showTradeFamilyBadges.showTradePossibleInterest.tradeRaritySymbols.showTradeNotes.tradeNotesPinned.showTradeFamilyOverlay.showVortexFamilyOverlay.familyImpactOverlaysEnabled.useFamilyBlacklist.showSalesFamilyOverlay.friendTooltipEnabled.navigationHotkeysEnabled.packOpeningHotkeysEnabled.anyKeyDismissesFoundPack.autoSkipOpening.autoDismissFoundPack.showRemainingPackCount.cardOverlaysEnabled.salesOverlaysEnabled.showSalesLastSale.salesLastSaleSetsPrice.showSalesLowestListing.salesLowestListingSetsPrice.showSalesMyLastListing.salesMyLastListingSetsPrice.statBoxesEnabled.pinnedAlbumsEnabled".split(".")) typeof n[e] == "boolean" && (t[e] = n[e]);
	for (let e of [
		"salesLastSaleAdjustment",
		"salesLowestListingAdjustment",
		"salesMyLastListingAdjustment"
	]) B(n[e]) && (t[e] = n[e]);
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
	return t.pinnedAlbumHotkeys = F(n.pinnedAlbumHotkeys, t.pinnedAlbums, t.hotkeys, t.packOpeningHotkeys), t;
}
async function G() {
	return W((await chrome.storage.local.get(H))[H]);
}
async function K(e) {
	await chrome.storage.local.set({ [H]: W(e) });
}
// src/shared/listing-cache.ts
var q = "kosmore.myListingPrices", J = "kosmore.listingHistory.", Y = (e) => e > 0 && Date.now() - e < 3e5, X = (e, t) => d.every((n) => e.counts[n] >= e.totals[n] || e.limits[n] >= t[n]), Z = () => new DOMException("Listing lookup canceled.", "AbortError"), Q = class {
	local;
	session;
	writes = Promise.resolve();
	pending = /* @__PURE__ */ new Map();
	epochs = /* @__PURE__ */ new Map();
	constructor(e, t) {
		this.local = e, this.session = t;
	}
	write(e) {
		let t = this.writes.then(e);
		return this.writes = t.catch(() => {}), t;
	}
	async index() {
		let e = (await this.local.get(q))[q], t = {
			v: 1,
			entries: {}
		};
		if (e?.v === 1 && e.entries && typeof e.entries == "object") for (let [n, r] of Object.entries(e.entries)) !/^[a-z0-9_]{1,24}:\d+$/.test(n) || !r || !Number.isFinite(r.checkedAt) || r.checkedAt < 0 || !Number.isFinite(r.usedAt) || (r.listing === null || p(r.listing) && r.listing.subjectId === n.split(":")[1]) && (t.entries[n] = r);
		return t;
	}
	async cached(e, t, n = !0) {
		return this.write(async () => {
			let r = await this.index(), i = `${e}:${t}`, a = r.entries[i];
			a && n && (a.usedAt = Date.now(), await this.local.set({ [q]: r }));
			let o = (await this.session.get(J + e))[J + e];
			return {
				...m(o) ? { batch: o } : {},
				...a ? { latest: {
					listing: a.listing,
					checkedAt: a.checkedAt
				} } : {}
			};
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
		return m(n) ? n : void 0;
	}
	async savePrice(e, t, n, r) {
		await this.write(async () => {
			if (this.epochs.get(e) !== r) return;
			let i = await this.index();
			i.entries[`${e}:${t}`] = {
				...n,
				usedAt: Date.now()
			};
			let a = Object.keys(i.entries).sort((e, t) => i.entries[e].usedAt - i.entries[t].usedAt);
			for (let e of a.slice(0, Math.max(0, a.length - 1e4))) delete i.entries[e];
			await this.local.set({ [q]: i });
		});
	}
	async invalidate(e) {
		this.epochs.set(e, (this.epochs.get(e) ?? 0) + 1), this.pending.get(e)?.controller.abort(), this.pending.delete(e), await this.write(async () => {
			let t = await this.index();
			for (let [n, r] of Object.entries(t.entries)) n.startsWith(`${e}:`) && (r.checkedAt = 0);
			await this.local.set({ [q]: t });
			let n = J + e, r = await this.session.get(n);
			m(r[n]) && await this.session.set({ [n]: {
				...r[n],
				fetchedAt: 0
			} });
		});
	}
	async history(e, t, n, r, i, a) {
		let o = await this.cached(e, t);
		i.throwIfAborted();
		let s = o.batch;
		if (n === "initial" && s && Y(s.fetchedAt) || n === "more" && s && g(s) && Y(s.fetchedAt)) return s;
		let c = n === "more" && a ? a : n === "more" && s ? v(s) : f();
		return this.ensure(e, c, r, i, n === "refresh" || !!s && !Y(s.fetchedAt));
	}
	async latest(e, t, n, r) {
		let i = await this.cached(e, t);
		if (r.throwIfAborted(), i.latest && Y(i.latest.checkedAt) && (!i.batch || i.batch.fetchedAt <= i.latest.checkedAt)) return i.latest;
		let a = this.epochs.get(e) ?? 0;
		this.epochs.set(e, a);
		let o = i.batch;
		for (o && Y(o.fetchedAt) || (o = await this.ensure(e, f(), n, r, !!o));;) {
			if (r.throwIfAborted(), this.epochs.get(e) !== a) throw Z();
			let i = _(o, t);
			if (!i.length) {
				let n = {
					listing: o.listings.find((e) => e.subjectId === t) ?? null,
					checkedAt: o.fetchedAt
				};
				if (await this.savePrice(e, t, n, a), r.aborted || this.epochs.get(e) !== a) throw Z();
				return n;
			}
			o = await this.ensure(e, v(o, i), n, r);
		}
	}
	async ensure(e, t, n, r, i = !1) {
		for (r.throwIfAborted(), this.epochs.has(e) || this.epochs.set(e, 0);;) {
			let a = this.epochs.get(e);
			if (!i) {
				let n = await this.batch(e);
				if (r.throwIfAborted(), n && Y(n.fetchedAt) && X(n, t)) return n;
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
					let t = /* @__PURE__ */ new Set(), r;
					for (;;) {
						let e = [...n.readers.keys()].find((e) => !t.has(e));
						if (!e) throw Error("The game tab closed during the listing lookup. Try again.");
						t.add(e);
						try {
							r = await e(n.limits, n.controller.signal);
							break;
						} catch (e) {
							if (n.controller.signal.aborted || !/Receiving end|port closed|tab.*closed|No tab/i.test(String(e))) throw e;
						}
					}
					if (!r || !m(r)) throw Error("Your listing history is unavailable.");
					if (this.epochs.get(e) !== a || n.controller.signal.aborted) throw Z();
					let i = await this.batch(e);
					if (i && r.fetchedAt <= i.fetchedAt && (r = {
						...r,
						fetchedAt: i.fetchedAt + 1
					}), i && Y(i.fetchedAt)) {
						for (let e of d) if (n.limits[e] > i.limits[e] && r.counts[e] <= i.counts[e] && r.counts[e] < r.totals[e]) throw Error("Your listing history stopped before all auctions were returned.");
					}
					return await this.saveBatch(e, r, a), r;
				});
				let r = () => {
					this.pending.get(e) === n && this.pending.delete(e);
				};
				n.promise.then(r, r);
			} else if (!o.started) for (let e of d) o.limits[e] = Math.max(o.limits[e], t[e]);
			let s = await this.consume(o, n, r);
			if (r.throwIfAborted(), this.epochs.get(e) !== a) throw Z();
			if (X(s, t)) return s;
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
				o() && i(Z());
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
function ee() {
	let e = new Q(chrome.storage.local, chrome.storage.session), t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Set();
	chrome.tabs.onRemoved.addListener((e) => {
		for (let [n, r] of t) n.startsWith(`${e}:`) && (r.abort(), t.delete(n));
	}), chrome.runtime.onMessage.addListener((r, i, a) => {
		if (i.id !== chrome.runtime.id || !i.tab || i.tab.id === void 0 || i.frameId !== 0 || !i.url?.startsWith("https://kosmora.io/") || !E(r) || !r.op.startsWith("listing")) return !1;
		let o = i.tab.id;
		if (r.op === "listingCancel") {
			let e = `${o}:${r.target}`, i = t.get(e);
			return i ? i.abort() : (n.add(e), setTimeout(() => n.delete(e), 3e4)), a({
				requestId: r.requestId,
				ok: !0,
				data: null
			}), !1;
		}
		if (!("accountKey" in r) || !("subjectId" in r)) return !1;
		let s = `${o}:${r.requestId}`, l = new AbortController();
		t.set(s, l), n.delete(s) && l.abort();
		let u = async (e, t) => {
			t.throwIfAborted();
			let n = crypto.randomUUID(), i = () => {
				chrome.tabs.sendMessage(o, {
					requestId: crypto.randomUUID(),
					op: "cancelListingBatch",
					target: n
				}).catch(() => {});
			};
			t.addEventListener("abort", i, { once: !0 });
			try {
				let i = await chrome.tabs.sendMessage(o, {
					requestId: n,
					op: "readListingBatch",
					accountKey: r.accountKey,
					limits: e
				});
				if (t.throwIfAborted(), !i || !i.ok) throw Object.assign(Error(i && !i.ok ? i.error : "Your listing history is unavailable."), {
					status: i?.status,
					retryAt: i?.retryAt
				});
				if (!m(i.data)) throw Error("Your listing history is unavailable.");
				return i.data;
			} finally {
				t.removeEventListener("abort", i);
			}
		};
		return (async () => {
			if (l.signal.throwIfAborted(), r.op === "listingCache") return e.cached(r.accountKey, r.subjectId);
			if (r.op === "listingHistory") return e.history(r.accountKey, r.subjectId, r.mode, u, l.signal, r.limits);
			if (r.op === "listingLatest") return e.latest(r.accountKey, r.subjectId, u, l.signal);
			if (r.op === "listingInvalidate") {
				await e.invalidate(r.accountKey);
				let t = await chrome.tabs.query({ url: "https://kosmora.io/*" });
				return await Promise.allSettled(t.filter((e) => e.id !== void 0).map((e) => chrome.tabs.sendMessage(e.id, {
					requestId: crypto.randomUUID(),
					op: "listingCacheChanged",
					accountKey: r.accountKey
				}))), null;
			}
			return null;
		})().then((e) => a({
			requestId: r.requestId,
			ok: !0,
			data: e
		}), (e) => a({
			requestId: r.requestId,
			ok: !1,
			error: c(e),
			status: e?.status,
			retryAt: e?.retryAt
		})).finally(() => t.delete(s)), !0;
	});
}
// src/background.ts
ee();
var $ = Promise.resolve();
chrome.tabs.onRemoved.addListener((e) => {
	chrome.storage.session.remove([`${b}${e}`, `${x}${e}`]);
}), chrome.action.onClicked.addListener(() => {
	chrome.runtime.openOptionsPage();
}), chrome.runtime.onMessage.addListener((e, t, n) => {
	if (t.id !== chrome.runtime.id || !E(e)) return !1;
	let r = t.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL("options.html"), i = !!t.tab && t.url?.startsWith("https://kosmora.io/");
	if ((e.op === "popupState" || e.op === "popupLayout" || e.op === "friendPopupState" || e.op === "friendPopupLayout") && i && t.tab?.id !== void 0 && t.frameId === 0) {
		let r = e.op === "friendPopupState" || e.op === "friendPopupLayout", i = `${r ? x : b}${t.tab.id}`, a = $.then(async () => {
			let t = C((await chrome.storage.session.get(i))[i]);
			if (e.op === "popupState" || e.op === "friendPopupState") return t;
			let n = e.change;
			if (n.tab !== void 0 && (t.tab = n.tab), n.pinned !== void 0 && (t.pinned = n.pinned), n.position && (t.position = S(n.position)), await chrome.storage.session.set({ [i]: t }), n.position || n.width !== void 0 || n.height !== void 0) {
				let e = await G();
				n.position && (e[r ? "friendTooltipPosition" : "popupPosition"] = S(n.position)), n.width !== void 0 && (e[r ? "friendTooltipWidth" : "popupWidth"] = Math.round(n.width)), n.height !== void 0 && (e[r ? "friendTooltipHeight" : "popupHeight"] = Math.round(n.height)), await K(e);
			}
			return t;
		});
		return $ = a.then(() => {}, () => {}), a.then((t) => n({
			requestId: e.requestId,
			ok: !0,
			data: t
		}), (t) => n({
			requestId: e.requestId,
			ok: !1,
			error: c(t)
		})), !0;
	}
	return e.op === "openOptions" && i ? (chrome.runtime.openOptionsPage().then(() => n({
		requestId: e.requestId,
		ok: !0,
		data: null
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
		error: c(t)
	})), !0) : !1;
});

//# sourceMappingURL=background.js.map