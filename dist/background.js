// src/shared/messages.ts
var e = (e) => typeof e == "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(e);
function t(t) {
	if (!t || typeof t != "object") return !1;
	let n = t;
	return e(n.requestId) && (["sessions", "openOptions"].includes(n.op) || n.op === "albums" && Number.isInteger(n.tabId) && n.tabId >= 0 && /^[a-z0-9_]{1,24}$/.test(n.accountKey));
}
// src/shared/types.ts
function n(e) {
	return e instanceof Error ? e.message : "The request failed. Please try again.";
}
chrome.action.onClicked.addListener(() => {
	chrome.runtime.openOptionsPage();
}), chrome.runtime.onMessage.addListener((e, r, i) => {
	if (r.id !== chrome.runtime.id || !t(e)) return !1;
	let a = r.url === chrome.runtime.getURL("options.html"), o = !!r.tab && r.url?.startsWith("https://kosmora.io/");
	return e.op === "openOptions" && o ? (chrome.runtime.openOptionsPage().then(() => i({
		requestId: e.requestId,
		ok: !0,
		data: null
	})), !0) : a ? ((async () => {
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
		if (e.op === "albums") {
			if (!(await chrome.tabs.get(e.tabId)).url?.startsWith("https://kosmora.io/")) throw Error("Choose a Kosmora tab.");
			let t = await chrome.tabs.sendMessage(e.tabId, {
				requestId: e.requestId,
				op: "listAlbums",
				accountKey: e.accountKey
			});
			if (!t?.ok || t.requestId !== e.requestId) throw Error(t && !t.ok ? t.error : "The game tab is unavailable.");
			return t.data;
		}
		throw Error("Unsupported request.");
	})().then((t) => i({
		requestId: e.requestId,
		ok: !0,
		data: t
	}), (t) => i({
		requestId: e.requestId,
		ok: !1,
		error: n(t)
	})), !0) : !1;
});

//# sourceMappingURL=background.js.map