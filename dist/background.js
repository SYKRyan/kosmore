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
		return i(n.auctionId), typeof n.submittedAt == "number" && Number.isSafeInteger(n.submittedAt) && n.submittedAt > 0;
	} catch {
		return !1;
	}
}
function E(t) {
	try {
		let n = e(t);
		return i(n.id) === n.id && r(n.subjectId) === n.subjectId && a(n.startPrice) === n.startPrice && (n.copyId === void 0 || m(n.copyId) === n.copyId) && typeof n.submittedAt == "number" && Number.isSafeInteger(n.submittedAt) && n.submittedAt > 0;
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
var k = "kosmore.popup.", A = "kosmore.friendPopup.";
function j(e) {
	if (!e || typeof e != "object") return null;
	let t = e;
	return [t.left, t.top].every((e) => typeof e == "number" && Number.isFinite(e) && e >= 0 && e <= 1e5) ? {
		left: Math.round(t.left),
		top: Math.round(t.top)
	} : null;
}
function ee(e) {
	if (!e || typeof e != "object") return {
		pinned: !1,
		position: null
	};
	let t = e;
	return {
		pinned: t.pinned === !0,
		position: j(t.position),
		...O(t.tab) ? { tab: t.tab } : {}
	};
}
function M(e, t = {
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
	].includes(e)) && (n.tab === void 0 || O(n.tab)) && (n.pinned === void 0 || typeof n.pinned == "boolean") && (n.position === void 0 || j(n.position) !== null) && (n.width === void 0 || Number.isFinite(n.width) && n.width >= t.minWidth && n.width <= 1200) && (n.height === void 0 || Number.isFinite(n.height) && n.height >= t.minHeight && n.height <= 1600);
}
// src/shared/messages.ts
var N = (e) => typeof e == "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(e);
function P(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return N(t.requestId) && (t.op === "listingObserved" && /^[a-z0-9_]{1,24}$/.test(t.accountKey) && t.subjectId === "0" && Array.isArray(t.rows) && t.rows.length <= 500 && t.rows.every(b) || [
		"listingCache",
		"listingSavedPrice",
		"listingAccountVerified",
		"listingInvalidate",
		"listingHistory",
		"listingRecord",
		"listingMetadata"
	].includes(t.op) && "accountKey" in t && "subjectId" in t && /^[a-z0-9_]{1,24}$/.test(t.accountKey) && typeof t.subjectId == "string" && /^\d+$/.test(t.subjectId) && (t.op !== "listingRecord" || Array.isArray(t.records) && t.records.length <= 500 && t.records.every(E) && (t.receipts === void 0 || Array.isArray(t.receipts) && t.receipts.length <= 500 && t.receipts.every(T))) && (t.op !== "listingMetadata" || Array.isArray(t.metadata) && t.metadata.length <= 100 && t.metadata.every((e) => Array.isArray(e) && e.length === 2 && typeof e[0] == "string" && m(e[0]) === e[0] && v(e[1]))) && (t.op !== "listingHistory" || ["more", "refresh"].includes(t.mode) && (t.limits === void 0 || S(t.limits))) || t.op === "listingCancel" && N(t.target) || t.op === "openOptions" && (t.section === void 0 || t.section === "stat-boxes") || [
		"sessions",
		"popupState",
		"friendPopupState"
	].includes(t.op) || t.op === "popupLayout" && M(t.change) || t.op === "friendPopupLayout" && M(t.change, {
		minWidth: 240,
		minHeight: 160
	}) || (t.op === "albums" || t.op === "families") && Number.isInteger(t.tabId) && t.tabId >= 0 && /^[a-z0-9_]{1,24}$/.test(t.accountKey));
}
// src/shared/stat-catalog.ts
var F = [
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
		read: (e) => I(e)
	}
];
function I(e) {
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
var L = () => F.map(({ id: e }) => ({
	id: e,
	enabled: !0
}));
function te(e) {
	if (!Array.isArray(e)) return L();
	let t = new Map(F.map((e) => [e.id, e])), n = /* @__PURE__ */ new Set(), r = [];
	for (let i of e) {
		if (!i || typeof i != "object") continue;
		let { id: e, enabled: a } = i;
		e && t.has(e) && !n.has(e) && (n.add(e), r.push({
			id: e,
			enabled: typeof a != "boolean" || a
		}));
	}
	return [...r, ...L().filter((e) => !n.has(e.id))];
}
// src/shared/hotkeys.ts
var R = [
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
], ne = [
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
], re = [
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
function ie(e, t = !1) {
	return typeof e == "string" && (/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(e) || t && /^(Arrow(?:Up|Down|Left|Right)|Home|End)$/.test(e));
}
function z(e) {
	return `${e.ctrl}-${e.alt}-${e.shift}-${e.meta}-${e.code}`;
}
function ae(e, t, n, r, i = {}) {
	if (!e || typeof e != "object") return {};
	let a = e, o = [
		...Object.values(n),
		...Object.values(r),
		...Object.values(i)
	].map(z);
	return Object.fromEntries(Object.entries(t).flatMap(([e, t]) => {
		if (!Object.hasOwn(a, e)) return [];
		let n = V(a[e], t.map((e) => ({
			id: e,
			label: e
		})), new Set(o));
		return Object.keys(n).length ? [[e, n]] : [];
	}));
}
function B(e) {
	return V(e, R);
}
function oe(e, t) {
	return V(e, ne, new Set(Object.values(t).map(z)), !0);
}
function se(e, t, n) {
	return V(e, re, new Set([...Object.values(t), ...Object.values(n)].map(z)), !0);
}
function V(e, t, n = /* @__PURE__ */ new Set(), r = !1) {
	let i = {};
	if (!e || typeof e != "object") return i;
	let a = e;
	for (let e of t) {
		let t = a[e.id];
		if (!t || typeof t != "object") continue;
		let o = t;
		if (!ie(o.code, r) || ![
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
		}, c = z(s);
		n.has(c) || (n.add(c), i[e.id] = s);
	}
	return i;
}
// src/shared/sales-prices.ts
var H = {
	Common: 1,
	Uncommon: 1,
	Rare: 1,
	Epic: 20,
	Legendary: 100,
	Mythic: 500
}, ce = 1000000n;
function le(e) {
	let t = e.match(/^(-?)(\d*)(?:\.(\d{0,6}))?$/);
	if (!t || !(t[2] || t[3])) return;
	let n = BigInt(t[2]) * ce + BigInt((t[3] ?? "").padEnd(6, "0"));
	return t[1] ? -n : n;
}
function ue(e) {
	let t = e.toLocaleString("en-US", {
		useGrouping: !1,
		maximumFractionDigits: 6
	});
	if (Number(t) === e) return le(t);
}
function de(e, t = 0) {
	return typeof e == "number" && Number.isFinite(e) && e > 0 && e >= t && ue(e) !== void 0;
}
function fe(e) {
	return typeof e == "number" && Number.isSafeInteger(e) && e >= 1;
}
function pe(e) {
	if (typeof e != "number" || !Number.isFinite(e)) return;
	let t = le(String(e)), n = BigInt(2 ** 53 - 1);
	if (t !== void 0 && t >= -n && t <= n) return t;
}
function me(e) {
	return pe(e) !== void 0;
}
function he(e, t = "per friend") {
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
var ge = "kosmore.settings", _e = () => ({
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
	salesCustomMinimums: { ...H },
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
	stats: L(),
	hotkeys: {},
	packOpeningHotkeys: {},
	hoverTooltipHotkeys: {},
	pinnedAlbums: {},
	pinnedAlbumHotkeys: {}
});
function ve(e) {
	let t = _e();
	if (!e || typeof e != "object") return t;
	let n = e;
	if (n.schemaVersion !== 1) return t;
	if (t.stats = te(n.stats), t.hotkeys = B(n.hotkeys), t.packOpeningHotkeys = oe(n.packOpeningHotkeys, t.hotkeys), t.hoverTooltipHotkeys = se(n.hoverTooltipHotkeys, t.hotkeys, t.packOpeningHotkeys), t.popupPosition = j(n.popupPosition), t.friendTooltipPosition = j(n.friendTooltipPosition), Array.isArray(n.familyBlacklist) && n.familyBlacklist.every((e) => typeof e == "string")) try {
		t.familyBlacklist = he(n.familyBlacklist, "in the family blacklist");
	} catch {}
	typeof n.enabled == "boolean" && (t.enabled = n.enabled);
	for (let e of /* @__PURE__ */ "disableHoverTooltipInPulsar.disableCardOverlaysInPulsar.disableHoverTooltipInVortex.disableCardOverlaysInVortex.useOverlayButtonInsteadOfHover.tooltipTakesFocus.outsideClickClosesTooltipOnly.fullScreenCenteredOnOpen.socialRemindersMasterEnabled.profileRemindersEnabled.profileRemindersPinned.socialRemindersEnabled.socialRemindersPinned.tradeRemindersEnabled.showTradeFamilyBadges.showTradePossibleInterest.tradeRaritySymbols.showTradeNotes.tradeNotesPinned.showTradeFamilyOverlay.showVortexFamilyOverlay.familyImpactOverlaysEnabled.useFamilyBlacklist.showSalesFamilyOverlay.friendTooltipEnabled.hotkeysEnabled.navigationHotkeysEnabled.hoverTooltipHotkeysEnabled.packOpeningHotkeysEnabled.anyKeyDismissesFoundPack.autoSkipOpening.autoDismissFoundPack.showRemainingPackCount.cardOverlaysEnabled.salesOverlaysEnabled.showSalesLastSale.salesLastSaleSetsPrice.showSalesLowestListing.salesLowestListingSetsPrice.showSalesMyLastListing.salesMyLastListingSetsPrice.salesDiscountEnabled.salesCustomMinimumsEnabled.salesQuickPricesEnabled.statBoxesEnabled.collectSaleRateData.pinnedAlbumsEnabled".split(".")) typeof n[e] == "boolean" && (t[e] = n[e]);
	for (let e of [
		"salesLastSaleAdjustment",
		"salesLowestListingAdjustment",
		"salesMyLastListingAdjustment"
	]) me(n[e]) && (t[e] = n[e]);
	de(n.salesDiscountAmount, 1) && (t.salesDiscountAmount = n.salesDiscountAmount), n.salesDiscountMode === "percent" && (t.salesDiscountMode = "percent"), fe(n.salesDiscountThreshold) && (t.salesDiscountThreshold = n.salesDiscountThreshold), Array.isArray(n.salesQuickPrices) && (t.salesQuickPrices = n.salesQuickPrices.filter((e) => de(e)));
	for (let e of Object.keys(H)) {
		let r = n.salesCustomMinimums?.[e];
		de(r, H[e]) && (t.salesCustomMinimums[e] = r);
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
	return t.pinnedAlbumHotkeys = ae(n.pinnedAlbumHotkeys, t.pinnedAlbums, t.hotkeys, t.packOpeningHotkeys, t.hoverTooltipHotkeys), t;
}
async function ye() {
	return ve((await chrome.storage.local.get(ge))[ge]);
}
async function be(e) {
	await chrome.storage.local.set({ [ge]: ve(e) });
}
// src/shared/listing-cache.ts
var xe = "kosmore.myListingPrices", U = "kosmore.listingHistory.", W = (e) => e > 0 && Date.now() - e < 3e5, Se = (e, t) => f.every((n) => e.counts[n] >= e.totals[n] || e.limits[n] >= t[n]), Ce = () => new DOMException("Listing lookup canceled.", "AbortError");
function we(e, t) {
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
var Te = class {
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
		let n = t.map((t) => this.key(e, t)), r = await this.local.get(n), i = n.some((e) => r[e] === void 0) ? await (this.legacyIndex ??= this.local.get(xe).then((e) => e[xe]).catch(() => {
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
				let a = o[i], l = t.get(c).map((e) => this.serverRow(e)), u = we(a.listings, l), d = a.listings[0], f = !d || l.some((e) => e.id === d.id) && n >= (d.submittedAt ?? a.checkedAt), p = f ? l[0]?.id ?? d?.id : d.id, m = u.findIndex((e) => e.id === p);
				m > 0 && u.unshift(...u.splice(m, 1)), s[this.key(e, c)] = this.saveState(a, u, r, f ? Math.max(n, a.checkedAt) : a.checkedAt);
			}
			i.throwIfAborted(), await this.local.set(s);
		});
	}
	async history(e, t, n, r, i, a) {
		let o = Date.now(), s = await this.batch(e);
		i.throwIfAborted();
		let c = n === "refresh", l = s && W(s.fetchedAt) ? s : void 0, u = c ? {
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
			let t = U + e, n = await this.session.get(t);
			x(n[t]) && await this.session.set({ [t]: {
				...n[t],
				fetchedAt: 0
			} });
		});
	}
	async saveBatch(e, t, n) {
		await this.write(async () => {
			if (this.epochs.get(e) !== n) return;
			let r = await this.session.get(null), i = U + e, a = Object.keys(r).filter((e) => e.startsWith(U)), o = JSON.stringify(t).length * 2;
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
		let t = U + e, n = (await this.session.get(t))[t];
		return x(n) ? n : void 0;
	}
	async ensure(e, t, n, r, i = !1) {
		for (r.throwIfAborted(), this.epochs.has(e) || this.epochs.set(e, 0);;) {
			let a = this.epochs.get(e);
			if (!i) {
				let n = await this.batch(e);
				if (r.throwIfAborted(), n && W(n.fetchedAt) && Se(n, t)) return n;
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
					}), o && W(o.fetchedAt)) {
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
			if (r.throwIfAborted(), Se(s, t)) return s;
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
				o() && i(Ce());
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
function Ee(e) {
	let t = new Te(chrome.storage.local, chrome.storage.session);
	chrome.runtime.onMessage.addListener((n, r, i) => r.id !== chrome.runtime.id || r.tab?.id === void 0 || r.frameId !== 0 || !r.url?.startsWith("https://kosmora.io/") || !P(n) || n.op !== "listingCache" && n.op !== "listingSavedPrice" && n.op !== "listingAccountVerified" && n.op !== "listingRecord" && n.op !== "listingObserved" ? !1 : ((async () => {
		let { accountKey: r, subjectId: i } = n;
		if (n.op === "listingAccountVerified") return e.importVerified(r);
		if (n.op === "listingSavedPrice") return e.latest(r, i);
		if (n.op === "listingCache") return t.tracked(r, i);
		if (n.op === "listingRecord") await e.record(r, n.records, n.receipts), await t.record(r, n.records);
		else if (n.op === "listingObserved") {
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
var De = () => ({
	cursor: 0,
	uploaded: 0,
	erasedAt: 0
}), G = 2 ** 53 - 1, K = (e) => "local:" + e;
function q(e) {
	return new Promise((t, n) => {
		e.onsuccess = () => t(e.result), e.onerror = () => n(e.error);
	});
}
var Oe = class {
	database;
	imports = /* @__PURE__ */ new Map();
	open() {
		return this.database ??= new Promise((e, t) => {
			let n = indexedDB.open("kosmore.confirmed-listings", 1);
			n.onupgradeneeded = () => {
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
			await q(e.index("auction").getKey([t, n])) || await q(e.add({
				id: n,
				subjectId: a.subjectId,
				startPrice: a.startPrice,
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
			let o = r ? await q(a.get(r)) : void 0, s = o?.generation === void 0 ? void 0 : JSON.stringify([r, o.generation]);
			if (await this.insert(i, K(e), t, !1, s), !n.length) return;
			let c = "receipts:" + e, l = await q(a.get(c)) ?? /* @__PURE__ */ new Map();
			for (let e of n) l.has(e.auctionId) || l.set(e.auctionId, e.submittedAt);
			await q(a.put(l, c));
		});
	}
	resolveReceipts(e, t) {
		return this.transaction("readwrite", async (n, r) => {
			let i = "receipts:" + e, a = await q(r.get(i)), o = [];
			if (!a?.size) return o;
			for (let e of t) {
				let t = e.id.toLowerCase(), n = a.get(t);
				n && (a.delete(t), o.push({
					id: t,
					submittedAt: n,
					subjectId: e.subjectId,
					startPrice: e.startPrice,
					copyId: e.copyId
				}));
			}
			return o.length && (await this.insert(n, K(e), o), await q(r.put(a, i))), o;
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
		if (await this.transaction("readonly", (e, n) => q(n.get(t)))) return;
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
		let o = n[xe];
		for (let [t, n] of Object.entries(o?.entries ?? {})) t.startsWith(e + ":") && a(t.slice(e.length + 1), n?.listing);
		await this.transaction("readwrite", async (n, r) => {
			await q(r.get(t)) || (await this.insert(n, K(e), i, !0), await q(r.put(!0, t)));
		});
	}
	async latest(e, t, n) {
		return await this.importVerified(e), this.transaction("readonly", async (r, i) => {
			let a = await q(i.get("cutoff:" + e)) ?? 0;
			return (await Promise.all([K(e), ...t ? [t] : []].map(async (e) => {
				let t = IDBKeyRange.bound([
					e,
					n,
					a + 1
				], [
					e,
					n,
					G,
					[]
				]);
				return (await q(r.index("latest").openCursor(t, "prev")))?.value;
			}))).filter((e) => !!e).sort((e, t) => t.submittedAt - e.submittedAt || (e.id < t.id ? 1 : e.id > t.id ? -1 : 0))[0];
		});
	}
	state(e) {
		return this.transaction("readonly", async (t, n) => await q(n.get(e)) ?? De());
	}
	pending(e, t) {
		return this.transaction("readonly", (n) => q(n.index("outbox").getAll(IDBKeyRange.bound([K(e), t + 1], [K(e), G]), 40)));
	}
	acknowledge(e, t, n) {
		return this.transaction("readwrite", async (r, i) => {
			let a = await q(i.get(e));
			a?.generation === t && await q(i.put({
				...a,
				uploaded: Math.max(a.uploaded, n)
			}, e));
		});
	}
	apply(e, t, n) {
		return this.transaction("readwrite", async (r, i) => {
			let a = await q(i.get(e)) ?? De();
			if (a.generation !== void 0 && n.generation < a.generation) return !1;
			let o = a.generation !== n.generation;
			if (!o && a.cursor > n.cursor) return !1;
			if (o && n.erasedAt) {
				let o = r.index("outbox");
				for (let r of [e, K(t)]) {
					let t = IDBKeyRange.bound([r, 0], [r, G]), i = o.openCursor(t);
					await new Promise((t, o) => {
						i.onerror = () => o(i.error), i.onsuccess = () => {
							let o = i.result;
							o ? ((r === e || o.value.legacy || a.generation !== void 0 && o.value.epoch === JSON.stringify([e, a.generation]) || o.value.submittedAt <= n.erasedAt) && o.delete(), o.continue()) : t();
						};
					});
				}
				await q(i.put(!0, "import:" + t));
				let s = "receipts:" + t, c = await q(i.get(s));
				if (c) {
					for (let [e, t] of c) t <= n.erasedAt && c.delete(e);
					await q(i.put(c, s));
				}
				let l = await q(i.get("cutoff:" + t)) ?? 0;
				await q(i.put(Math.max(l, n.erasedAt), "cutoff:" + t));
			}
			await this.insert(r, e, n.records);
			for (let e of n.records) {
				let n = await q(r.index("auction").get([K(t), e.id]));
				n && (n.submittedAt !== e.submittedAt || n.startPrice !== e.startPrice || n.subjectId !== e.subjectId) && await q(r.put({
					...n,
					subjectId: e.subjectId,
					startPrice: e.startPrice,
					submittedAt: e.submittedAt
				}));
			}
			return await q(i.put({
				...a,
				generation: n.generation,
				cursor: n.cursor,
				erasedAt: n.erasedAt
			}, e)), !!n.records.length || o && !!n.erasedAt;
		});
	}
}, J = "/v1/me/listing-history", Y = "kosmore.listing-history", X = (e) => typeof e == "number" && Number.isSafeInteger(e) && e >= 0;
function ke(e) {
	if (!e || !X(e.generation) || !X(e.cursor) || !X(e.erasedAt) || typeof e.hasMore != "boolean" || !Array.isArray(e.records) || !e.records.every(E)) throw Error("Services returned invalid listing history.");
	return e;
}
var Ae = class {
	link;
	store = new Oe();
	work = Promise.resolve();
	queued = /* @__PURE__ */ new Map();
	retry = /* @__PURE__ */ new Map();
	constructor(e) {
		this.link = e;
	}
	install() {
		let e = async () => {
			chrome.alarms && !await chrome.alarms.get(Y) && await chrome.alarms.create(Y, { periodInMinutes: 5 });
		};
		e().catch(() => {}), chrome.runtime.onStartup?.addListener(() => {
			e().catch(() => {}), this.schedule();
		}), chrome.alarms?.onAlarm.addListener((e) => {
			e.name === Y && chrome.tabs.query({ url: "https://kosmora.io/*" }).then((e) => {
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
			let i = ke(await (await this.checked(e, J + "/changes?" + r)).json());
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
			r.length && await this.checked(e, J + "/batch", "POST", {
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
			let i = await (await this.checked(n, J + "?generation=" + r.generation, "DELETE")).json();
			if (!X(i.generation) || i.generation <= r.generation || !X(i.erasedAt)) throw Error("Services could not confirm erasure.");
			await this.store.apply(n.scope, n.handle, {
				...i,
				records: [],
				hasMore: !1,
				cursor: 0
			}), await this.changed(n.handle);
		});
	}
}, je = class {
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
	async saveConnection(e) {
		let t = await this.open();
		return new Promise((n, r) => {
			let i = t.transaction(["connection", "listings"], "readwrite");
			i.oncomplete = () => n(), i.onabort = () => r(i.error), i.objectStore("connection").put(e, "current"), i.objectStore("listings").clear();
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
}, Me = "kosmore.servicesConnectionChanged", Z = (e) => typeof e == "string" && /^[1-9]\d{0,17}$/.test(e);
function Ne(e) {
	let t = new URL(e.trim());
	if (t.protocol !== "https:" && !(t.protocol === "http:" && ["localhost", "127.0.0.1"].includes(t.hostname)) || t.username || t.password || t.search || t.hash || /[?#]/.test(e) || ["kosmora.io", "developers.kosmora.io"].includes(t.hostname)) throw Error("Use HTTPS, or use HTTP with localhost or 127.0.0.1 for local testing.");
	return t.origin + t.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
}
function Pe(e) {
	let { protocol: t, hostname: n } = new URL(e);
	return `${t}//${n}/*`;
}
function Fe(e) {
	if (e === "shiny") return "veil";
	if (e === "plain" || e === "fullart") return e;
	throw Error("Invalid card finish.");
}
function Ie(r, i) {
	let s = e(r), c = e(s.card);
	if (c.id !== i) throw Error("Card ID mismatch.");
	let l = {};
	for (let t of [
		"plain",
		"shiny",
		"fullart"
	]) {
		let r = Fe(t), i = e(e(s.sales)[t]), c = e(i.last30Days), u = i.lastSale === null ? void 0 : e(i.lastSale), d = e(s.history)[t];
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
				price: a(n.price),
				endsAt: o(n.endsAt)
			};
		}),
		markets: l
	};
}
function Le(t, n) {
	if (!Array.isArray(t)) throw Error("Open listings unavailable.");
	return t.map((t) => {
		let r = e(t);
		if (e(r.card).id !== n || typeof r.id != "string" || !/^[0-9a-f]{24}$/.test(r.id)) throw Error("Invalid listing.");
		return {
			id: r.id,
			finish: Fe(r.finish),
			startPrice: a(r.startPrice),
			endsAt: o(r.endsAt)
		};
	});
}
// src/services-background.ts
var Re = 864e5, ze = 100, Q = "kosmore.deferredCard", $ = "kosmore.pendingAccountLink", Be = 1;
function Ve() {
	let t = new je(), n = "", r, i = new AbortController(), a = 0, o = /* @__PURE__ */ new Map(), s = !1, c, u, d, f = 0, p = /* @__PURE__ */ new Map(), m, h = 0, g = /* @__PURE__ */ new Set(), _, v = t.connection().then(async (e) => {
		n = e?.base ?? "", r = e?.session, u = (await chrome.storage.session?.get($))?.[$];
		let t = (await chrome.storage?.session?.get(Q))?.[Q];
		t?.base === n && t?.player === r?.playerId && Z(t?.id) && (_ = t.id);
	}), y = Promise.resolve(), b = (e) => {
		let t = y.then(e);
		return y = t.catch(() => {}), t;
	}, x = fetch(chrome.runtime.getURL("card-cache-config.json")).then(async (t) => {
		let n = e(await t.json()), r = n.retentionDays, i = n.freshnessSeconds;
		if (typeof r != "number" || !Number.isInteger(r) || r < 1 || typeof i != "number" || !Number.isInteger(i) || i < 1 || i > r * 86400) throw Error("Invalid card cache configuration.");
		return {
			retention: r * Re,
			freshness: i * 1e3
		};
	});
	x.catch(() => {}), v.catch(() => {});
	let S = new Ae(async () => {
		await v;
		let e = r, t = n, a = i.signal;
		if (!(!e?.handle || e.blocked || e.expiresAt <= Date.now() || e.scopes && !e.scopes.includes("listings"))) return {
			scope: JSON.stringify([t, e.playerId]),
			handle: e.handle.toLowerCase(),
			signal: a,
			async request(n, i = "GET", o) {
				let s = await E(t, n, a, e.token, o, i);
				return s.status === 403 && (await s.clone().json().catch(() => ({})))?.error === "scope_missing" ? await b(async () => {
					!a.aborted && r === e && await T(t, {
						...e,
						scopes: (e.scopes ?? ["identity"]).filter((e) => e !== "listings")
					});
				}) : await R(s, t, e, a), s;
			}
		};
	});
	S.install();
	let C = () => ({
		base: n,
		...r && {
			playerId: r.playerId,
			handle: r.handle ?? "Linked Kosmora account",
			expiresAt: r.expiresAt,
			blocked: r.blocked
		}
	});
	async function w(e) {
		_ = e, e ? await chrome.storage?.session?.set({ [Q]: {
			id: e,
			base: n,
			player: r?.playerId
		} }).catch(() => {}) : await chrome.storage?.session?.remove(Q).catch(() => {});
	}
	async function T(e, a) {
		await k(), i.abort(), i = new AbortController();
		for (let e of o.values()) e.resolve();
		o.clear(), g.clear(), m = void 0, h = 0, f = 0, p.clear(), n = e, r = a, await w(), await t.saveConnection({
			base: n,
			session: r
		}), await chrome.storage.local.set({ [Me]: crypto.randomUUID() });
	}
	async function E(e, t, n, r, i, a = i === void 0 ? "GET" : "POST") {
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
	let D = (e) => btoa(String.fromCharCode(...e)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), O = () => D(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(32)));
	async function k() {
		u && (await chrome.storage.session.remove($), u = void 0, await chrome.declarativeNetRequest?.updateSessionRules({ removeRuleIds: [Be] }));
	}
	async function A(e) {
		await chrome.storage.session.set({ [$]: e }), u = e;
	}
	async function j(t, n, r) {
		let i = O(), a = O(), o = async (e) => D(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e)))), s = n ? await o(n) : void 0, c = u;
		if (c && c.target === t && c.expiresAt > Date.now() && (!n || c.inviteHash === s)) return c;
		await k();
		let l = Date.now() + 6e5, d = await E(t, "/v1/connect/start", r, void 0, {
			redirectUri: chrome.identity.getRedirectURL("kosmore-services"),
			handoffChallenge: await o(i),
			state: a,
			...n && { inviteCode: n }
		});
		if (!d.ok) throw e(await d.json().catch(() => ({}))).error === "invite_unavailable" ? Error("This invite is unavailable. Ask the administrator for a new code.") : Error(`Services could not start account linking (HTTP ${d.status}).`);
		let f = new URL(e(await d.json()).authorizationUrl);
		if (f.origin !== "https://kosmora.io" || f.username || f.password) throw Error("Services returned an unexpected Kosmora authorization URL.");
		return {
			target: t,
			verifier: i,
			state: a,
			authorizationUrl: f.href,
			expiresAt: l,
			inviteHash: s
		};
	}
	async function ee(e, t, r = !1) {
		let a = Ne(e);
		if (r && !chrome.declarativeNetRequest?.updateSessionRules) throw Error("This browser cannot receive a sign-in link in another tab.");
		if (!await chrome.permissions.contains({ origins: [Pe(a)] })) throw Error("Allow access to the Services host before connecting.");
		c?.abort();
		let o = new AbortController();
		c = o;
		let s = await b(async () => {
			o.signal.throwIfAborted(), n !== a && await T(a);
			let e = AbortSignal.any([o.signal, i.signal]), s = await j(a, t?.trim(), e);
			if (e.throwIfAborted(), r) {
				let e = chrome.runtime.id + "\\.chromiumapp\\.org";
				await A(s), await chrome.declarativeNetRequest.updateSessionRules({
					removeRuleIds: [Be],
					addRules: [{
						id: Be,
						action: {
							type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
							redirect: { regexSubstitution: chrome.runtime.getURL("link-complete.html") + "#\\1" }
						},
						condition: {
							regexFilter: `^https://${e}/kosmore-services\\?((code|error)=[A-Za-z0-9_-]+&state=${s.state})$`,
							isUrlFilterCaseSensitive: !0,
							resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME]
						}
					}]
				});
			} else await k();
			return s;
		});
		if (r) return { url: s.authorizationUrl };
		let u = AbortSignal.any([o.signal, i.signal]);
		u.throwIfAborted();
		let d;
		try {
			d = await chrome.identity.launchWebAuthFlow({
				url: s.authorizationUrl,
				interactive: !0
			});
		} catch (e) {
			throw /couldn.t create a browser window/i.test(l(e)) ? (await b(async () => {
				u.throwIfAborted(), await A(s);
			}), Error("The browser could not open the sign-in window. Choose Copy Link to continue in another tab.")) : e;
		}
		if (!d) throw Error("Kosmora did not complete account linking.");
		return N(s, d, u);
	}
	async function M(e) {
		let { link: t, signal: r } = await b(async () => {
			let t = u;
			if (!t || t.target !== n || t.expiresAt <= Date.now()) throw Error("This link has expired or has already been used. Return to KosMore Settings.");
			let r = new URLSearchParams(e).getAll("state");
			if (r.length !== 1 || r[0] !== t.state) throw Error("This callback does not match the link from KosMore Settings.");
			await k();
			let a = c ??= new AbortController();
			return {
				link: t,
				signal: AbortSignal.any([a.signal, i.signal])
			};
		});
		return N(t, chrome.identity.getRedirectURL("kosmore-services") + "?" + e, r);
	}
	async function N(t, n, r) {
		let { target: i, verifier: a, state: o } = t, s = chrome.identity.getRedirectURL("kosmore-services"), c = new URL(n), l = c.searchParams.get("code");
		if (c.origin + c.pathname !== s || c.hash || c.searchParams.getAll("state").length !== 1 || c.searchParams.get("state") !== o) throw Error("Kosmora returned an invalid account-linking callback.");
		let u = c.searchParams.get("error");
		if (u === "whitelist_required") throw Error("Approval required. Enter a tester invite or ask the administrator for access.");
		if (u === "invite_unavailable") throw Error("This invite is unavailable. Ask the administrator for a new code.");
		if (!l || c.searchParams.has("error") || c.searchParams.getAll("code").length !== 1) throw Error("Kosmora account linking was declined or failed.");
		let d = await E(i, "/v1/connect/exchange", r, void 0, {
			code: l,
			handoffVerifier: a
		});
		if (!d.ok) throw Error(`Services could not complete account linking (HTTP ${d.status}).`);
		let f = e(await d.json()), p = f.accessToken, m = Date.parse(String(f.expiresAtUtc));
		if (typeof p != "string" || !p || !Number.isFinite(m) || m <= Date.now()) throw Error("Services returned an invalid session.");
		let h = await E(i, "/v1/me", r, p);
		if (!h.ok) throw Error(`Services could not verify the linked account (HTTP ${h.status}).`);
		let g = e(await h.json());
		if (typeof g.id != "string" || !/^[a-f0-9]{24}$/.test(g.id)) throw Error("Services returned an invalid player identity.");
		r.throwIfAborted();
		let _ = g.id;
		return b(async () => (r.throwIfAborted(), await T(i, {
			token: p,
			expiresAt: m,
			scopes: Array.isArray(f.scopes) ? f.scopes : void 0,
			playerId: _,
			handle: typeof g.handle == "string" ? g.handle : void 0
		}), S.schedule(), C()));
	}
	let P = (e, t) => JSON.stringify([e, t]), F = (e, t, n) => JSON.stringify([
		e,
		t,
		n
	]);
	async function I(e, a) {
		let o = r, s = n, c = i.signal, { retention: l, freshness: u } = await x, d = await t.get("cards", P(s, e)), f = (a && o && !o.blocked && o.handle?.toLowerCase() === a && o.expiresAt > Date.now() ? await Promise.all(["all", e].map((e) => t.get("listings", F(s, o.playerId, e)))) : []).filter((e) => !!e && (e.freshUntil ?? 0) > Date.now()).sort((e, t) => t.fetchedAt - e.fetchedAt)[0];
		c.throwIfAborted();
		let p = Date.now(), m = d ? Math.min(d.fetchedAt + u, d.freshUntil) : 0, h = f?.listings.filter((t) => t.subjectId === e && Date.parse(t.endsAt) > p);
		return !d || d.fetchedAt <= p - l || d.missing && m <= p ? {
			stale: !0,
			until: 0,
			listings: h,
			accessBlocked: o?.blocked
		} : {
			accessBlocked: o?.blocked,
			fetchedAt: d.fetchedAt,
			card: d.card,
			missing: d.missing,
			stale: m <= p,
			until: m,
			listings: h
		};
	}
	function L(e, t) {
		let n = e && /^\d+$/.test(e) ? Number(e) * 1e3 : e ? Date.parse(e) - Date.now() : typeof t == "number" && Number.isFinite(t) ? t * 1e3 : 15e3;
		return Math.max(1e3, Number.isFinite(n) ? n : 15e3);
	}
	async function te(e, t) {
		let n = await chrome.tabs.query({ url: "https://kosmora.io/*" });
		await Promise.allSettled(n.flatMap((n) => n.id === void 0 ? [] : [chrome.tabs.sendMessage(n.id, {
			op: "servicesCardsChanged",
			ids: e,
			firstFetchedAt: t
		}, { frameId: 0 })]));
	}
	async function R(e, t, n, i) {
		return e.status !== 401 && e.status !== 403 ? !1 : (await b(async () => {
			!i.aborted && r === n && await T(t, e.status === 403 ? {
				...n,
				blocked: !0
			} : void 0);
		}), !0);
	}
	async function ne(a) {
		let o = r, s = n, c = i.signal;
		if (!o || !a || o.handle?.toLowerCase() !== a || o.blocked || o.expiresAt <= Date.now() || o.scopes && !o.scopes.includes("listings")) return;
		let l = F(s, o.playerId, "all"), u = await t.get("listings", l);
		if (c.throwIfAborted(), (u?.freshUntil ?? 0) > Date.now() || Math.max(h, f) > Date.now()) return;
		if (m) return m;
		let d = (async () => {
			let n = await E(s, "/v1/me/listings", c, o.token);
			if (n.status === 403 && (await n.clone().json().catch(() => ({})))?.error === "scope_missing") {
				await b(async () => {
					!c.aborted && r === o && await T(s, {
						...o,
						scopes: (o.scopes ?? ["identity"]).filter((e) => e !== "listings")
					});
				});
				return;
			}
			if (await R(n, s, o, c)) return;
			if (!n.ok) {
				h = Date.now() + L(n.headers.get("Retry-After")), n.status === 429 && (f = h);
				return;
			}
			let i = e(await n.json()).auctions;
			if (!Array.isArray(i)) throw Error("Invalid listing snapshot.");
			let a = i.flatMap((t) => {
				let n = e(e(t).card).id;
				if (!Z(n)) throw Error("Invalid listing card.");
				return Le([t], n).map((e) => ({
					...e,
					subjectId: n
				}));
			}), u = Date.now(), d = Date.parse(n.headers.get("X-KosMore-Fresh-Until") ?? "");
			await t.save([], [{
				key: l,
				fetchedAt: u,
				freshUntil: Number.isFinite(d) ? d : u + 6e4,
				listings: a
			}], c);
		})().catch((e) => {
			throw c.aborted || (h = Date.now() + 15e3), e;
		}).finally(() => {
			m === d && (m = void 0);
		});
		return m = d, d;
	}
	async function re(n, r, i, a, o) {
		let s = await E(r, "/v1/cards/details", a, i.token, {
			ids: n,
			includeMyListings: o,
			...o && { preferScopedBatch: !0 }
		});
		if (await R(s, r, i, a)) return;
		if (!s.ok) {
			f = Date.now() + L(s.headers.get("Retry-After"));
			return;
		}
		let c = e(await s.json());
		if (o && c.myListingsStatus === "scope-missing" && (h = i.expiresAt), !Array.isArray(c.cards)) throw Error("Invalid Services batch.");
		a.throwIfAborted();
		let l = new Set(n), u = [], d = {}, m = [], g = [], _ = Date.now(), v = _ + L(s.headers.get("Retry-After"), c.retryAfterSeconds);
		for (let n of c.cards) try {
			let a = e(n), s = a.id;
			if (!Z(s) || !l.delete(s)) continue;
			if (o && c.myListingsStatus === "fresh" && Array.isArray(a.myListings)) {
				let e = Date.parse(String(c.myListingsFreshUntilUtc));
				g.push({
					key: F(r, i.playerId, s),
					fetchedAt: _,
					freshUntil: Number.isFinite(e) ? e : _ + 6e4,
					listings: Le(a.myListings, s).map((e) => ({
						...e,
						subjectId: s
					}))
				});
			}
			if (o && c.myListingsStatus === "unavailable" && (h = Math.max(h, v)), a.status !== "fresh" && a.status !== "stale" && a.status !== "notFound") {
				p.set(s, v);
				continue;
			}
			let f = Date.parse(String(a.fetchedAtUtc)), y = Date.parse(String(a.freshUntilUtc));
			if (!Number.isFinite(f) || !Number.isFinite(y) || y < f) throw Error("Invalid Services cache timestamps.");
			a.status === "stale" && p.set(s, v);
			let b = P(r, s), x = await t.get("cards", b);
			if (x && (x.fetchedAt > f || x.fetchedAt === f && x.freshUntil >= y)) continue;
			let S = a.status === "notFound" ? {
				key: b,
				fetchedAt: f,
				freshUntil: y,
				missing: !0
			} : {
				key: b,
				fetchedAt: f,
				freshUntil: a.status === "stale" ? Math.min(y, _) : y,
				card: Ie(a.details, s)
			};
			m.push(S), u.push(s), x || (d[s] = f);
		} catch {
			Z(n?.id) && p.set(n.id, v);
		}
		for (let e of l) p.set(e, v);
		a.throwIfAborted(), await t.save(m, g, a), a.throwIfAborted(), u.length && te(u, d).catch(() => {});
	}
	async function ie() {
		s = !0;
		try {
			for (; o.size;) {
				let e = [...o.values()][0].privateDemand, t = [...o].filter(([, t]) => t.privateDemand === e).slice(0, ze);
				_ && g.add(_);
				for (let n of g) {
					if (t.length === ze) break;
					g.delete(n), o.has(n) || (p.get(n) ?? 0) > Date.now() || (ae(n, e), t.push([n, o.get(n)]));
				}
				let a = r, s = i.signal, c = n;
				try {
					if (_ && t.some(([e]) => e === _) && await w(), s.throwIfAborted(), a && !a.blocked && a.expiresAt > Date.now() && f <= Date.now()) {
						let n = await B(t.map(([e]) => e), c);
						s.throwIfAborted(), n.length && await re(n, c, a, s, e);
					}
				} catch {
					s.aborted || (f = Date.now() + 15e3);
				} finally {
					for (let [e, n] of t) o.get(e) === n && o.delete(e), n.resolve();
				}
			}
		} finally {
			s = !1;
		}
	}
	function z(e, t) {
		if (!(!r || r.blocked || r.expiresAt <= Date.now() || f > Date.now() || (p.get(e) ?? 0) > Date.now())) return g.delete(e), ae(e, t);
	}
	function ae(e, t) {
		let n = o.get(e);
		if (n) return n.privateDemand ||= t, n.promise;
		let r, i = new Promise((e) => {
			r = e;
		});
		return o.set(e, {
			promise: i,
			resolve: r,
			privateDemand: t
		}), !s && d === void 0 && (d = setTimeout(() => {
			d = void 0, ie().catch(() => {});
		}, 35)), i;
	}
	async function B(e, n) {
		let { freshness: r } = await x, i = await t.getCards(e.map((e) => P(n, e))), a = Date.now();
		return e.filter((e, t) => {
			let n = i[t];
			return !n || Math.min(n.freshUntil, n.fetchedAt + r) <= a;
		});
	}
	async function oe(e, s, c, l = !1, u = !1) {
		if (r && r.expiresAt <= Date.now() && await b(async () => {
			r && r.expiresAt <= Date.now() && await T(n);
		}), !n) return {};
		let d = i.signal;
		if (c) {
			if (!r || r.blocked) return {};
			let t = await B([...new Set(e)], n);
			d.throwIfAborted();
			for (let e of t) o.has(e) || (g.add(e), g.size > 500 && g.delete(g.values().next().value));
			return !_ && g.size && await w(g.values().next().value), {};
		}
		let { retention: f } = await x, m = Date.now();
		if (m - a >= 36e5) {
			a = m;
			for (let [e, t] of p) t <= m && p.delete(e);
			t.prune(m - f).catch(() => {});
		}
		let v = {};
		return await Promise.all([...new Set(e)].map(async (e) => {
			let t = await I(e, s);
			d.throwIfAborted();
			let n = u && s !== void 0 && r?.handle?.toLowerCase() === s && !r.blocked && (!r.scopes || r.scopes.includes("listings")) && t.listings === void 0;
			if (t.stale && !l) {
				let r = z(e, n && h <= Date.now());
				(n || !t.card) && (await r, d.throwIfAborted(), t = await I(e, s));
			}
			n && !t.missing && t.listings === void 0 && (await ne(s), d.throwIfAborted(), t = await I(e, s)), v[e] = t;
		})), d.throwIfAborted(), v;
	}
	return chrome.runtime.onMessage.addListener((e, t, a) => {
		if (t.id !== chrome.runtime.id || !e || typeof e.requestId != "string") return !1;
		let o = t.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL("options.html"), s = t.frameId === 0 && t.tab && t.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL("link-complete.html"), u = t.tab && t.frameId === 0 && t.url?.startsWith("https://kosmora.io/");
		return !(o && [
			"servicesStatus",
			"servicesRetry",
			"servicesSave",
			"servicesConnect",
			"servicesCopyLink",
			"servicesDisconnect",
			"servicesEraseHistory"
		].includes(e.op)) && !(s && e.op === "servicesFinishLink") && !(u && [
			"servicesRead",
			"servicesObserve",
			"servicesPeek"
		].includes(e.op)) ? !1 : (v.then(async () => {
			switch (e.op) {
				case "servicesStatus": return r && r.expiresAt <= Date.now() && await b(async () => {
					r && r.expiresAt <= Date.now() && await T(n);
				}), C();
				case "servicesRetry": return b(async () => {
					let e = r;
					if (!e?.blocked) return C();
					let t = await E(n, "/v1/me", i.signal, e.token);
					if (t.status === 401) await T(n);
					else if (t.ok) await T(n, {
						...e,
						blocked: !1
					});
					else if (t.status !== 403) throw Error("Services is temporarily unavailable.");
					return C();
				});
				case "servicesSave": {
					if (typeof e.base != "string") throw Error("Invalid Services URL.");
					let t = e.base ? Ne(e.base) : "";
					return t !== n && c?.abort(), b(async () => (t !== n && await T(t), C()));
				}
				case "servicesFinishLink":
					if (typeof e.query != "string" || e.query.length > 1024) throw Error("Invalid account-linking callback.");
					return M(e.query);
				case "servicesConnect":
				case "servicesCopyLink":
					if (typeof e.base != "string") throw Error("Invalid Services URL.");
					return ee(e.base, typeof e.inviteCode == "string" ? e.inviteCode : void 0, e.op === "servicesCopyLink");
				case "servicesEraseHistory":
					if (typeof e.playerId != "string" || typeof e.base != "string") throw Error("Confirm the linked account.");
					return await S.erase(e.playerId, e.base), C();
				case "servicesDisconnect": return c?.abort(), b(async () => {
					let e = r, t = n;
					if (await T(t), e && e.expiresAt > Date.now()) {
						let n = await E(t, "/v1/disconnect", i.signal, e.token, {});
						if (!n.ok && n.status !== 401) throw Error("Disconnected locally. Services could not revoke the previous session.");
					}
					return C();
				});
				default:
					if (!Array.isArray(e.ids) || e.ids.length > 500 || !e.ids.every(Z)) throw Error("Invalid card request.");
					return oe(e.ids, typeof e.account == "string" && /^[a-z0-9_]{1,24}$/.test(e.account) ? e.account : void 0, e.op === "servicesObserve", e.op === "servicesPeek", e.op === "servicesRead" && e.includeMyListings === !0);
			}
		}).then((t) => a({
			requestId: e.requestId,
			ok: !0,
			data: t
		}), (t) => a({
			requestId: e.requestId,
			ok: !1,
			error: l(t)
		})), !0);
	}), S;
}
// src/background.ts
Ee(Ve());
var He = Promise.resolve();
chrome.tabs.onRemoved.addListener((e) => {
	chrome.storage.session.remove([`${k}${e}`, `${A}${e}`]);
}), chrome.action.onClicked.addListener(() => {
	chrome.runtime.openOptionsPage();
}), chrome.runtime.onMessage.addListener((e, t, n) => {
	if (t.id !== chrome.runtime.id || !P(e)) return !1;
	let r = t.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL("options.html"), i = !!t.tab && t.url?.startsWith("https://kosmora.io/");
	if ((e.op === "popupState" || e.op === "popupLayout" || e.op === "friendPopupState" || e.op === "friendPopupLayout") && i && t.tab?.id !== void 0 && t.frameId === 0) {
		let r = e.op === "friendPopupState" || e.op === "friendPopupLayout", i = `${r ? A : k}${t.tab.id}`, a = He.then(async () => {
			let t = ee((await chrome.storage.session.get(i))[i]);
			if (e.op === "popupState" || e.op === "friendPopupState") return t;
			let n = e.change;
			if (n.tab !== void 0 && (t.tab = n.tab), n.pinned !== void 0 && (t.pinned = n.pinned), n.position && (t.position = j(n.position)), await chrome.storage.session.set({ [i]: t }), n.position || n.width !== void 0 || n.height !== void 0) {
				let e = await ye();
				n.position && (e[r ? "friendTooltipPosition" : "popupPosition"] = j(n.position)), n.width !== void 0 && (e[r ? "friendTooltipWidth" : "popupWidth"] = Math.round(n.width)), n.height !== void 0 && (e[r ? "friendTooltipHeight" : "popupHeight"] = Math.round(n.height)), await be(e);
			}
			return t;
		});
		return He = a.then(() => {}, () => {}), a.then((t) => n({
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