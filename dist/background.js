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
function p(e) {
	if (typeof e == "string") try {
		return r(e).toLowerCase();
	} catch {
		return;
	}
}
var m = (e) => /^cancel/i.test(e ?? "");
function h(e) {
	if (e === "expired" || m(e)) return "unsold";
	if (e === "sold") return "sold";
	if (e === "open") return "selling";
}
function g(e) {
	let { state: t, endsAt: n } = e;
	if (typeof t != "string" || typeof n != "string" || !Number.isFinite(Date.parse(n))) return;
	let r = h(t);
	if (r) return {
		group: r,
		state: t,
		endsAt: n
	};
}
function _(e) {
	if (!e || typeof e != "object") return !1;
	let { copyId: t, outcome: n } = e;
	return (t !== void 0 || n !== void 0) && (t === void 0 || typeof t == "string" && p(t) === t) && (n === void 0 || !!n && typeof n == "object" && g({
		state: n.state,
		endsAt: n.endsAt
	})?.group === n.group && d.includes(n.group));
}
function ee(e, t) {
	let n = t.copyId ?? e.copyId, r = e.group ?? h(e.state), i = r === "sold" || r === "unsold" ? void 0 : t.outcome;
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
function v(o) {
	try {
		let s = e(o);
		return r(s.id), n(s.subjectId), a(s.endsAt), i(s.startPrice), t(s.state), d.includes(s.group) && (s.copyId === void 0 || p(s.copyId) === s.copyId) && [
			"plain",
			"veil",
			"fullart"
		].includes(String(s.finish));
	} catch {
		return !1;
	}
}
function y(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return b(t.limits) && Array.isArray(t.listings) && t.listings.every(v) && [t.totals, t.counts].every((e) => e && d.every((t) => Number.isSafeInteger(e[t]) && e[t] >= 0)) && (t.startedAt === void 0 || Number.isFinite(t.startedAt) && t.startedAt >= 0) && Number.isFinite(t.fetchedAt) && t.fetchedAt >= 0;
}
function b(e) {
	return !e || typeof e != "object" ? !1 : d.every((t) => {
		let n = e[t];
		return Number.isInteger(n) && n >= 1 && n <= 1e6;
	});
}
var x = (e) => d.every((t) => e.counts[t] >= e.totals[t]);
function S(e, t = d) {
	let n = { ...e.limits };
	for (let r of t) if (e.counts[r] < e.totals[r] && (n[r] = Math.min(e.totals[r], Math.max(n[r] * 2, 50)), n[r] <= e.limits[r])) throw Error("Your listing history stopped before all auctions were returned.");
	return n;
}
// src/kosmora/listing-capture.ts
function C(t) {
	try {
		let a = e(t);
		return r(a.id) === a.id && n(a.subjectId) === a.subjectId && i(a.startPrice) === a.startPrice && (a.copyId === void 0 || p(a.copyId) === a.copyId) && typeof a.submittedAt == "number" && Number.isSafeInteger(a.submittedAt) && a.submittedAt > 0;
	} catch {
		return !1;
	}
}
// src/shared/popup-layout.ts
var w = [
	"market",
	"history",
	"trade",
	"notes"
];
function T(e) {
	return w.some((t) => t === e);
}
var E = "kosmore.popup.", D = "kosmore.friendPopup.";
function O(e) {
	if (!e || typeof e != "object") return null;
	let t = e;
	return [t.left, t.top].every((e) => typeof e == "number" && Number.isFinite(e) && e >= 0 && e <= 1e5) ? {
		left: Math.round(t.left),
		top: Math.round(t.top)
	} : null;
}
function te(e) {
	if (!e || typeof e != "object") return {
		pinned: !1,
		position: null
	};
	let t = e;
	return {
		pinned: t.pinned === !0,
		position: O(t.position),
		...T(t.tab) ? { tab: t.tab } : {}
	};
}
function k(e, t = {
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
	].includes(e)) && (n.tab === void 0 || T(n.tab)) && (n.pinned === void 0 || typeof n.pinned == "boolean") && (n.position === void 0 || O(n.position) !== null) && (n.width === void 0 || Number.isFinite(n.width) && n.width >= t.minWidth && n.width <= 1200) && (n.height === void 0 || Number.isFinite(n.height) && n.height >= t.minHeight && n.height <= 1600);
}
// src/shared/messages.ts
var A = (e) => typeof e == "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(e);
function j(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return A(t.requestId) && ([
		"listingCache",
		"listingSavedPrice",
		"listingInvalidate",
		"listingHistory",
		"listingRecord",
		"listingMetadata"
	].includes(t.op) && "accountKey" in t && "subjectId" in t && /^[a-z0-9_]{1,24}$/.test(t.accountKey) && typeof t.subjectId == "string" && /^\d+$/.test(t.subjectId) && (t.op !== "listingRecord" || Array.isArray(t.records) && t.records.length <= 500 && t.records.every(C)) && (t.op !== "listingMetadata" || Array.isArray(t.metadata) && t.metadata.length <= 100 && t.metadata.every((e) => Array.isArray(e) && e.length === 2 && typeof e[0] == "string" && p(e[0]) === e[0] && _(e[1]))) && (t.op !== "listingHistory" || ["more", "refresh"].includes(t.mode) && (t.limits === void 0 || b(t.limits))) || t.op === "listingCancel" && A(t.target) || t.op === "openOptions" && (t.section === void 0 || t.section === "stat-boxes") || [
		"sessions",
		"popupState",
		"friendPopupState"
	].includes(t.op) || t.op === "popupLayout" && k(t.change) || t.op === "friendPopupLayout" && k(t.change, {
		minWidth: 240,
		minHeight: 160
	}) || (t.op === "albums" || t.op === "families") && Number.isInteger(t.tabId) && t.tabId >= 0 && /^[a-z0-9_]{1,24}$/.test(t.accountKey));
}
// src/shared/stat-catalog.ts
var M = [
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
		read: (e) => ne(e)
	}
];
function ne(e) {
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
var N = () => M.map(({ id: e }) => ({
	id: e,
	enabled: !0
}));
function re(e) {
	if (!Array.isArray(e)) return N();
	let t = new Map(M.map((e) => [e.id, e])), n = /* @__PURE__ */ new Set(), r = [];
	for (let i of e) {
		if (!i || typeof i != "object") continue;
		let { id: e, enabled: a } = i;
		e && t.has(e) && !n.has(e) && (n.add(e), r.push({
			id: e,
			enabled: typeof a != "boolean" || a
		}));
	}
	return [...r, ...N().filter((e) => !n.has(e.id))];
}
// src/shared/hotkeys.ts
var ie = [
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
], ae = [
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
], oe = [
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
function se(e, t = !1) {
	return typeof e == "string" && (/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(e) || t && /^(Arrow(?:Up|Down|Left|Right)|Home|End)$/.test(e));
}
function P(e) {
	return `${e.ctrl}-${e.alt}-${e.shift}-${e.meta}-${e.code}`;
}
function F(e, t, n, r, i = {}) {
	if (!e || typeof e != "object") return {};
	let a = e, o = [
		...Object.values(n),
		...Object.values(r),
		...Object.values(i)
	].map(P);
	return Object.fromEntries(Object.entries(t).flatMap(([e, t]) => {
		if (!Object.hasOwn(a, e)) return [];
		let n = z(a[e], t.map((e) => ({
			id: e,
			label: e
		})), new Set(o));
		return Object.keys(n).length ? [[e, n]] : [];
	}));
}
function I(e) {
	return z(e, ie);
}
function L(e, t) {
	return z(e, ae, new Set(Object.values(t).map(P)), !0);
}
function R(e, t, n) {
	return z(e, oe, new Set([...Object.values(t), ...Object.values(n)].map(P)), !0);
}
function z(e, t, n = /* @__PURE__ */ new Set(), r = !1) {
	let i = {};
	if (!e || typeof e != "object") return i;
	let a = e;
	for (let e of t) {
		let t = a[e.id];
		if (!t || typeof t != "object") continue;
		let o = t;
		if (!se(o.code, r) || ![
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
var B = {
	Common: 1,
	Uncommon: 1,
	Rare: 1,
	Epic: 20,
	Legendary: 100,
	Mythic: 500
}, V = 1000000n;
function H(e) {
	let t = e.match(/^(-?)(\d*)(?:\.(\d{0,6}))?$/);
	if (!t || !(t[2] || t[3])) return;
	let n = BigInt(t[2]) * V + BigInt((t[3] ?? "").padEnd(6, "0"));
	return t[1] ? -n : n;
}
function U(e) {
	let t = e.toLocaleString("en-US", {
		useGrouping: !1,
		maximumFractionDigits: 6
	});
	if (Number(t) === e) return H(t);
}
function W(e) {
	return e === 0 || G(e);
}
function G(e, t = 0) {
	return typeof e == "number" && Number.isFinite(e) && e > 0 && e >= t && U(e) !== void 0;
}
function ce(e) {
	return typeof e == "number" && Number.isSafeInteger(e) && e >= 1;
}
function le(e) {
	if (typeof e != "number" || !Number.isFinite(e)) return;
	let t = H(String(e)), n = BigInt(2 ** 53 - 1);
	if (t !== void 0 && t >= -n && t <= n) return t;
}
function ue(e) {
	return le(e) !== void 0;
}
function de(e, t = "per friend") {
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
var K = "kosmore.settings", fe = () => ({
	schemaVersion: 1,
	enabled: !0,
	disableHoverTooltipInPulsar: !1,
	disableHoverTooltipInVortex: !1,
	useOverlayButtonInsteadOfHover: !1,
	tooltipTakesFocus: !1,
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
	hotkeysEnabled: !0,
	navigationHotkeysEnabled: !0,
	hoverTooltipHotkeysEnabled: !0,
	packOpeningHotkeysEnabled: !1,
	anyKeyDismissesFoundPack: !0,
	autoSkipOpening: !1,
	autoDismissFoundPack: !1,
	showRemainingPackCount: !0,
	fusionEnabled: !1,
	fusionNextBatchEnabled: !0,
	fusionRespectFamilyImpact: !0,
	fusionRespectBlacklist: !0,
	fusionRespectPriceThreshold: !1,
	fusionExcludeFullArts: !0,
	fusionExcludeShiny: !0,
	fusionExcludeNumberOnes: !0,
	fusionPriceThreshold: 0,
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
	salesDiscountEnabled: !1,
	salesDiscountAmount: 25,
	salesDiscountMode: "flat",
	salesDiscountThreshold: 5,
	salesCustomMinimumsEnabled: !1,
	salesCustomMinimums: { ...B },
	salesQuickPricesEnabled: !1,
	salesQuickPrices: [],
	statBoxesEnabled: !0,
	collectSaleRateData: !0,
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
	stats: N(),
	hotkeys: {},
	packOpeningHotkeys: {},
	hoverTooltipHotkeys: {},
	pinnedAlbums: {},
	pinnedAlbumHotkeys: {}
});
function q(e) {
	let t = fe();
	if (!e || typeof e != "object") return t;
	let n = e;
	if (n.schemaVersion !== 1) return t;
	if (t.stats = re(n.stats), t.hotkeys = I(n.hotkeys), t.packOpeningHotkeys = L(n.packOpeningHotkeys, t.hotkeys), t.hoverTooltipHotkeys = R(n.hoverTooltipHotkeys, t.hotkeys, t.packOpeningHotkeys), t.popupPosition = O(n.popupPosition), t.friendTooltipPosition = O(n.friendTooltipPosition), Array.isArray(n.familyBlacklist) && n.familyBlacklist.every((e) => typeof e == "string")) try {
		t.familyBlacklist = de(n.familyBlacklist, "in the family blacklist");
	} catch {}
	typeof n.enabled == "boolean" && (t.enabled = n.enabled);
	for (let e of /* @__PURE__ */ "disableHoverTooltipInPulsar.disableCardOverlaysInPulsar.disableHoverTooltipInVortex.disableCardOverlaysInVortex.useOverlayButtonInsteadOfHover.tooltipTakesFocus.outsideClickClosesTooltipOnly.fullScreenCenteredOnOpen.socialRemindersMasterEnabled.profileRemindersEnabled.profileRemindersPinned.socialRemindersEnabled.socialRemindersPinned.tradeRemindersEnabled.showTradeFamilyBadges.showTradePossibleInterest.tradeRaritySymbols.showTradeNotes.tradeNotesPinned.showTradeFamilyOverlay.showVortexFamilyOverlay.familyImpactOverlaysEnabled.useFamilyBlacklist.showSalesFamilyOverlay.friendTooltipEnabled.hotkeysEnabled.navigationHotkeysEnabled.hoverTooltipHotkeysEnabled.packOpeningHotkeysEnabled.anyKeyDismissesFoundPack.autoSkipOpening.autoDismissFoundPack.showRemainingPackCount.fusionEnabled.fusionNextBatchEnabled.fusionRespectFamilyImpact.fusionRespectBlacklist.fusionRespectPriceThreshold.fusionExcludeFullArts.fusionExcludeShiny.fusionExcludeNumberOnes.cardOverlaysEnabled.salesOverlaysEnabled.showSalesLastSale.salesLastSaleSetsPrice.showSalesLowestListing.salesLowestListingSetsPrice.showSalesMyLastListing.salesMyLastListingSetsPrice.salesDiscountEnabled.salesCustomMinimumsEnabled.salesQuickPricesEnabled.statBoxesEnabled.collectSaleRateData.pinnedAlbumsEnabled".split(".")) typeof n[e] == "boolean" && (t[e] = n[e]);
	W(n.fusionPriceThreshold) && (t.fusionPriceThreshold = n.fusionPriceThreshold);
	for (let e of [
		"salesLastSaleAdjustment",
		"salesLowestListingAdjustment",
		"salesMyLastListingAdjustment"
	]) ue(n[e]) && (t[e] = n[e]);
	G(n.salesDiscountAmount, 1) && (t.salesDiscountAmount = n.salesDiscountAmount), n.salesDiscountMode === "percent" && (t.salesDiscountMode = "percent"), ce(n.salesDiscountThreshold) && (t.salesDiscountThreshold = n.salesDiscountThreshold), Array.isArray(n.salesQuickPrices) && (t.salesQuickPrices = n.salesQuickPrices.filter((e) => G(e)));
	for (let e of Object.keys(B)) {
		let r = n.salesCustomMinimums?.[e];
		G(r, B[e]) && (t.salesCustomMinimums[e] = r);
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
	return t.pinnedAlbumHotkeys = F(n.pinnedAlbumHotkeys, t.pinnedAlbums, t.hotkeys, t.packOpeningHotkeys, t.hoverTooltipHotkeys), t;
}
async function pe() {
	return q((await chrome.storage.local.get(K))[K]);
}
async function me(e) {
	await chrome.storage.local.set({ [K]: q(e) });
}
// src/shared/listing-cache.ts
var J = "kosmore.myListingPrices", Y = "kosmore.listingHistory.", X = (e) => e > 0 && Date.now() - e < 3e5, Z = (e, t) => d.every((n) => e.counts[n] >= e.totals[n] || e.limits[n] >= t[n]), he = () => new DOMException("Listing lookup canceled.", "AbortError");
function ge(e, t) {
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
var _e = class {
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
		if (r && C(r.latest) && r.latest.subjectId === n) {
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
			v(e?.listing) && e.listing.subjectId === n && i.listings.push(this.serverRow(e.listing));
		}
		return i;
	}
	async readTracked(e, t) {
		let n = t.map((t) => this.key(e, t)), r = await this.local.get(n), i = n.some((e) => r[e] === void 0) ? await (this.legacyIndex ??= this.local.get(J).then((e) => e[J]).catch(() => {
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
				let t = n.get(e.id.toLowerCase()), r = t ? ee(e, t) : e;
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
	async importRows(e, t, n, r, i) {
		t.size && await this.write(async () => {
			i.throwIfAborted();
			let a = [...t.keys()], o = await this.readTracked(e, a), s = {};
			for (let [i, c] of a.entries()) {
				let a = o[i], l = t.get(c).map((e) => this.serverRow(e)), u = ge(a.listings, l), d = a.listings[0], f = !d || l.some((e) => e.id === d.id) && n >= (d.submittedAt ?? a.checkedAt), p = f ? l[0]?.id ?? d?.id : d.id, m = u.findIndex((e) => e.id === p);
				m > 0 && u.unshift(...u.splice(m, 1)), s[this.key(e, c)] = this.saveState(a, u, r, f ? Math.max(n, a.checkedAt) : a.checkedAt);
			}
			i.throwIfAborted(), await this.local.set(s);
		});
	}
	async history(e, t, n, r, i, a) {
		let o = Date.now(), s = await this.batch(e);
		i.throwIfAborted();
		let c = n === "refresh", l = s && X(s.fetchedAt) ? s : void 0, u = c ? {
			selling: 180,
			sold: 180,
			unsold: 180
		} : a ?? (l ? S(l) : f()), p = await this.ensure(e, u, r, i, c || !!s && !l);
		if (c && d.some((e) => p.counts[e] < Math.min(p.totals[e], 180))) throw Error("Your listing history stopped before the newest auctions were returned.");
		let m = /* @__PURE__ */ new Map(), h = x(p) && (!c || p.listings.length <= 180);
		m.set(t, []);
		let g = c ? p.listings.slice(0, 180) : p.listings;
		for (let e of g) {
			if (!c && e.subjectId !== t) continue;
			let n = m.get(e.subjectId) ?? [];
			n.push(e), m.set(e.subjectId, n);
		}
		return await this.importRows(e, m, p.startedAt ?? Math.min(o, p.fetchedAt), h, i), c ? void 0 : {
			...p,
			listings: m.get(t)
		};
	}
	async invalidate(e) {
		this.epochs.set(e, (this.epochs.get(e) ?? 0) + 1), await this.write(async () => {
			let t = Y + e, n = await this.session.get(t);
			y(n[t]) && await this.session.set({ [t]: {
				...n[t],
				fetchedAt: 0
			} });
		});
	}
	async saveBatch(e, t, n) {
		await this.write(async () => {
			if (this.epochs.get(e) !== n) return;
			let r = await this.session.get(null), i = Y + e, a = Object.keys(r).filter((e) => e.startsWith(Y)), o = JSON.stringify(t).length * 2;
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
		let t = Y + e, n = (await this.session.get(t))[t];
		return y(n) ? n : void 0;
	}
	async ensure(e, t, n, r, i = !1) {
		for (r.throwIfAborted(), this.epochs.has(e) || this.epochs.set(e, 0);;) {
			let a = this.epochs.get(e);
			if (!i) {
				let n = await this.batch(e);
				if (r.throwIfAborted(), n && X(n.fetchedAt) && Z(n, t)) return n;
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
					if (!i || !y(i)) throw Error("Your listing history is unavailable.");
					n.controller.signal.throwIfAborted(), i = {
						...i,
						startedAt: t
					};
					let o = await this.batch(e);
					if (o && i.fetchedAt <= o.fetchedAt && (i = {
						...i,
						fetchedAt: o.fetchedAt + 1
					}), o && X(o.fetchedAt)) {
						for (let e of d) if (n.limits[e] > o.limits[e] && i.counts[e] <= o.counts[e] && i.counts[e] < i.totals[e]) throw Error("Your listing history stopped before all auctions were returned.");
					}
					return await this.saveBatch(e, i, a), i;
				});
				let r = () => {
					this.pending.get(e) === n && this.pending.delete(e);
				};
				n.promise.then(r, r);
			} else if (!o.started) for (let e of d) o.limits[e] = Math.max(o.limits[e], t[e]);
			let s = await this.consume(o, n, r);
			if (r.throwIfAborted(), Z(s, t)) return s;
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
				o() && i(he());
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
function Q() {
	let e = new _e(chrome.storage.local, chrome.storage.session), t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Set();
	chrome.tabs.onRemoved.addListener((e) => {
		for (let [n, r] of t) n.startsWith(`${e}:`) && (r.abort(), t.delete(n));
	}), chrome.runtime.onMessage.addListener((r, i, a) => {
		if (i.id !== chrome.runtime.id || !i.tab || i.tab.id === void 0 || i.frameId !== 0 || !i.url?.startsWith("https://kosmora.io/") || !j(r) || !r.op.startsWith("listing")) return !1;
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
				if (!y(i.data)) throw Error("Your listing history is unavailable.");
				return i.data;
			} finally {
				t.removeEventListener("abort", i);
			}
		}, d = async () => {
			let e = await chrome.tabs.query({ url: "https://kosmora.io/*" });
			await Promise.allSettled(e.filter((e) => e.id !== void 0).map((e) => chrome.tabs.sendMessage(e.id, {
				requestId: crypto.randomUUID(),
				op: "listingCacheChanged",
				accountKey: r.accountKey
			})));
		};
		return (async () => {
			if (l.signal.throwIfAborted(), r.op === "listingCache") return e.tracked(r.accountKey, r.subjectId);
			if (r.op === "listingSavedPrice") return (await e.tracked(r.accountKey, r.subjectId)).listings[0];
			if (r.op === "listingMetadata") return await e.attachMetadata(r.accountKey, r.subjectId, new Map(r.metadata), l.signal) && await d(), null;
			if (r.op === "listingHistory") {
				let t = await e.history(r.accountKey, r.subjectId, r.mode, u, l.signal, r.limits);
				return await d(), t;
			}
			return (r.op === "listingRecord" || r.op === "listingInvalidate") && (r.op === "listingRecord" && await e.record(r.accountKey, r.records), await e.invalidate(r.accountKey), await d()), null;
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
Q();
var $ = Promise.resolve();
chrome.tabs.onRemoved.addListener((e) => {
	chrome.storage.session.remove([`${E}${e}`, `${D}${e}`]);
}), chrome.action.onClicked.addListener(() => {
	chrome.runtime.openOptionsPage();
}), chrome.runtime.onMessage.addListener((e, t, n) => {
	if (t.id !== chrome.runtime.id || !j(e)) return !1;
	let r = t.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL("options.html"), i = !!t.tab && t.url?.startsWith("https://kosmora.io/");
	if ((e.op === "popupState" || e.op === "popupLayout" || e.op === "friendPopupState" || e.op === "friendPopupLayout") && i && t.tab?.id !== void 0 && t.frameId === 0) {
		let r = e.op === "friendPopupState" || e.op === "friendPopupLayout", i = `${r ? D : E}${t.tab.id}`, a = $.then(async () => {
			let t = te((await chrome.storage.session.get(i))[i]);
			if (e.op === "popupState" || e.op === "friendPopupState") return t;
			let n = e.change;
			if (n.tab !== void 0 && (t.tab = n.tab), n.pinned !== void 0 && (t.pinned = n.pinned), n.position && (t.position = O(n.position)), await chrome.storage.session.set({ [i]: t }), n.position || n.width !== void 0 || n.height !== void 0) {
				let e = await pe();
				n.position && (e[r ? "friendTooltipPosition" : "popupPosition"] = O(n.position)), n.width !== void 0 && (e[r ? "friendTooltipWidth" : "popupWidth"] = Math.round(n.width)), n.height !== void 0 && (e[r ? "friendTooltipHeight" : "popupHeight"] = Math.round(n.height)), await me(e);
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
	return e.op === "openOptions" && i ? ((e.section ? chrome.tabs.create({ url: chrome.runtime.getURL("options.html#stat-boxes") }) : chrome.runtime.openOptionsPage()).then(() => n({
		requestId: e.requestId,
		ok: !0,
		data: null
	}), (t) => n({
		requestId: e.requestId,
		ok: !1,
		error: c(t)
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