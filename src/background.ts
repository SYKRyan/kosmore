import { isRequest, type Result, type Session } from "./shared/messages";
import { messageOf } from "./shared/types";
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !isRequest(message)) return false;
  const isOptions = sender.url === chrome.runtime.getURL("options.html");
  const isGame = !!sender.tab && sender.url?.startsWith("https://kosmora.io/");
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
