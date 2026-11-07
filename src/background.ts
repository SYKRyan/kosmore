import { isRequest, type Result, type Session } from "./shared/messages";
import { messageOf } from "./shared/types";
import {
  parsePopupPosition,
  parsePopupState,
  POPUP_SESSION_PREFIX,
  FRIEND_POPUP_SESSION_PREFIX,
} from "./shared/popup-layout";
import { readSettings, saveSettings } from "./shared/settings";
import { installListingBackground } from "./listing-background";
installListingBackground();
let layoutWrites = Promise.resolve();
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove([
    `${POPUP_SESSION_PREFIX}${tabId}`,
    `${FRIEND_POPUP_SESSION_PREFIX}${tabId}`,
  ]);
});
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !isRequest(message)) return false;
  const isOptions = sender.url === chrome.runtime.getURL("options.html");
  const isGame = !!sender.tab && sender.url?.startsWith("https://kosmora.io/");
  if (
    (message.op === "popupState" ||
      message.op === "popupLayout" ||
      message.op === "friendPopupState" ||
      message.op === "friendPopupLayout") &&
    isGame &&
    sender.tab?.id !== undefined &&
    sender.frameId === 0
  ) {
    const friendPopup =
      message.op === "friendPopupState" || message.op === "friendPopupLayout";
    const key = `${friendPopup ? FRIEND_POPUP_SESSION_PREFIX : POPUP_SESSION_PREFIX}${sender.tab.id}`;
    const result = layoutWrites.then(async () => {
      const state = parsePopupState(
        (await chrome.storage.session.get(key))[key],
      );
      if (message.op === "popupState" || message.op === "friendPopupState")
        return state;
      const change = message.change;
      if (change.tab !== undefined) state.tab = change.tab;
      if (change.pinned !== undefined) state.pinned = change.pinned;
      if (change.position) state.position = parsePopupPosition(change.position);
      await chrome.storage.session.set({ [key]: state });
      if (
        change.position ||
        change.width !== undefined ||
        change.height !== undefined
      ) {
        const settings = await readSettings();
        if (change.position)
          settings[friendPopup ? "friendTooltipPosition" : "popupPosition"] =
            parsePopupPosition(change.position);
        if (change.width !== undefined)
          settings[friendPopup ? "friendTooltipWidth" : "popupWidth"] =
            Math.round(change.width);
        if (change.height !== undefined)
          settings[friendPopup ? "friendTooltipHeight" : "popupHeight"] =
            Math.round(change.height);
        await saveSettings(settings);
      }
      return state;
    });
    layoutWrites = result.then(
      () => {},
      () => {},
    );
    void result.then(
      (data) => respond({ requestId: message.requestId, ok: true, data }),
      (error) =>
        respond({
          requestId: message.requestId,
          ok: false,
          error: messageOf(error),
        }),
    );
    return true;
  }
  if (message.op === "openOptions" && isGame) {
    void chrome.runtime
      .openOptionsPage()
      .then(() =>
        respond({ requestId: message.requestId, ok: true, data: null }),
      );
    return true;
  }
  if (!isOptions) return false;
  void (async () => {
    if (message.op === "sessions") {
      const tabs = await chrome.tabs.query({ url: "https://kosmora.io/*" });
      const sessions = await Promise.allSettled(
        tabs
          .filter((t) => t.id !== undefined)
          .map(async (tab) => {
            const result = (await chrome.tabs.sendMessage(tab.id!, {
              requestId: message.requestId,
              op: "session",
            })) as Result<Session["account"]>;
            if (!result?.ok || result.requestId !== message.requestId)
              throw new Error("Game tab unavailable.");
            return { tabId: tab.id!, account: result.data };
          }),
      );
      return sessions.flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : [],
      );
    }
    if (message.op === "albums") {
      const tab = await chrome.tabs.get(message.tabId);
      if (!tab.url?.startsWith("https://kosmora.io/"))
        throw new Error("Choose a Kosmora tab.");
      const result = (await chrome.tabs.sendMessage(message.tabId, {
        requestId: message.requestId,
        op: "listAlbums",
        accountKey: message.accountKey,
      })) as Result<unknown>;
      if (!result?.ok || result.requestId !== message.requestId)
        throw new Error(
          result && !result.ok ? result.error : "The game tab is unavailable.",
        );
      return result.data;
    }
    throw new Error("Unsupported request.");
  })().then(
    (data) => respond({ requestId: message.requestId, ok: true, data }),
    (error) =>
      respond({
        requestId: message.requestId,
        ok: false,
        error: messageOf(error),
      }),
  );
  return true;
});
