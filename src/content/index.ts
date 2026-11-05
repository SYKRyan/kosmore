import { GameClient } from "../kosmora/client";
import { contextKey, HOST_ID, resolveCard, topDialog } from "../kosmora/dom";
import { isTabRequest } from "../shared/messages";
import {
  defaults,
  parseSettings,
  readSettings,
  SETTINGS_KEY,
} from "../shared/settings";
import {
  FINISHES,
  messageOf,
  type CardContext,
  type Finish,
} from "../shared/types";
import {
  MARKET_FINISHES_KEY,
  parseMarketFinishes,
  readMarketFinishes,
  saveMarketFinishes,
} from "../shared/market-preferences";
import { Popup } from "./popup";
import { SocialReminders } from "./social";
import { CardOverlays } from "./card-overlays";

const client = new GameClient();
new SocialReminders(client).start();
const overlays = new CardOverlays(client);
overlays.start();
let settings = defaults();
let marketFinishes: Finish[] = [...FINISHES];
let pendingFilterWrites = 0;
const preferencesReady = readMarketFinishes()
  .then((finishes) => {
    marketFinishes = finishes;
  })
  .catch(() => {});
let current: CardContext | null = null,
  popup: Popup | undefined;
let activeRequest: AbortController | undefined,
  openTimer: ReturnType<typeof setTimeout> | undefined,
  closeTimer: ReturnType<typeof setTimeout> | undefined;
let headerSignalRequest = 0;
let lastUrl = location.href,
  hovered = false,
  scheduled = false,
  dialog: HTMLDialogElement | undefined;
function cancelClose() {
  clearTimeout(closeTimer);
}
function hide() {
  clearTimeout(openTimer);
  cancelClose();
  activeRequest?.abort();
  activeRequest = undefined;
  popup?.dispose();
  popup = undefined;
  current = null;
}
function laterHide() {
  cancelClose();
  if (popup?.isPinned) return;
  closeTimer = setTimeout(() => {
    if (
      !popup?.isPinned &&
      !hovered &&
      !popup?.host.matches(":hover") &&
      !popup?.shadow.activeElement
    )
      hide();
  }, settings.dismissDelayMs);
}
function options() {
  void chrome.runtime
    .sendMessage({ requestId: crypto.randomUUID(), op: "openOptions" })
    .catch(() => {});
}
async function show(context: CardContext, fresh = false) {
  await preferencesReady;
  if (!settings.enabled || current !== context) return;
  activeRequest?.abort();
  const placement = popup?.pinnedPlacement();
  popup?.dispose();
  current = context;
  dialog = topDialog();
  const abort = new AbortController();
  activeRequest = abort;
  const view = new Popup(
    context,
    client,
    () => void show(context, true),
    hide,
    options,
    marketFinishes,
    async (finishes) => {
      marketFinishes = [...finishes];
      pendingFilterWrites++;
      try {
        await saveMarketFinishes(finishes);
      } finally {
        pendingFilterWrites--;
      }
    },
    settings,
    placement,
    () => {
      cancelClose();
      if (!popup?.isPinned && !hovered) laterHide();
    },
  );
  popup = view;
  view.host.addEventListener("pointerenter", cancelClose);
  view.host.addEventListener("pointerleave", () => {
    if (!hovered) laterHide();
  });
  view.host.addEventListener("focusin", cancelClose);
  view.host.addEventListener("focusout", () => {
    if (!hovered) laterHide();
  });
  const valid = () => !abort.signal.aborted && popup === view;
  try {
    const account = await client.account(abort.signal);
    if (!valid()) return;
    view.setAccount(account, settings.pinnedAlbums[account.key] ?? []);
    loadHeaderSignals(view, context, abort.signal);
    const detail = client.insights(context.subjectId, abort.signal, fresh);
    void detail.then(
      async (d) => {
        if (!valid()) return;
        view.setInsights(d);
        let chosen;
        let problem: string | undefined;
        try {
          chosen = await client.resolveCopy(context, d.copies, abort.signal);
          if (context.surface !== "page" && !chosen)
            problem =
              "The exact pack copy could not be verified. Select an owned copy explicitly.";
        } catch {
          problem =
            "The pack copy could not be loaded. Select an owned copy explicitly.";
        }
        if (valid()) view.setCopies(chosen, problem);
      },
      (error) => {
        if (valid()) view.insightsFailed(error);
      },
    );
    for (const finish of FINISHES)
      void client.history(context.subjectId, finish, abort.signal, fresh).then(
        (h) => {
          if (valid()) view.setHistory(finish, h);
        },
        (error) => {
          if (valid()) view.setHistory(finish, new Error(messageOf(error)));
        },
      );
    void client
      .albums(context.subjectId, abort.signal)
      .then(
        (albums) => {
          if (valid())
            view.setAlbums(
              account,
              albums,
              settings.pinnedAlbums[account.key] ?? [],
            );
        },
        (error) => {
          if (valid()) view.albumsFailed(error);
        },
      )
      .catch((error) => {
        if (valid()) view.albumsFailed(error);
      });
  } catch (error) {
    if (valid()) {
      view.insightsFailed(error);
      view.albumsFailed(error);
      for (const f of FINISHES) view.setHistory(f, new Error(messageOf(error)));
    }
  }
}
function loadHeaderSignals(
  view: Popup,
  context: CardContext,
  signal: AbortSignal,
) {
  const request = ++headerSignalRequest,
    requestedSettings = settings;
  view.setSignals();
  void overlays
    .signals(context, requestedSettings)
    .then((signals) => {
      if (
        !signal.aborted &&
        popup === view &&
        settings === requestedSettings &&
        request === headerSignalRequest
      )
        view.setSignals(signals);
    })
    .catch(() => {});
}
function enter(target: Element) {
  if (target.closest(`#${HOST_ID}`)) {
    cancelClose();
    return;
  }
  const context = resolveCard(target);
  if (!context) {
    hovered = false;
    return;
  }
  hovered = true;
  cancelClose();
  if (
    current &&
    contextKey(current) === contextKey(context) &&
    current.anchor === context.anchor
  )
    return;
  if (popup?.isPinned) clearTimeout(openTimer);
  else hide();
  current = context;
  openTimer = setTimeout(() => {
    if (current === context) void show(context);
  }, settings.hoverDelayMs);
}
document.addEventListener(
  "pointerover",
  (event) => {
    if (event.target instanceof Element) enter(event.target);
  },
  true,
);
document.addEventListener(
  "pointerout",
  (event) => {
    const next = event.relatedTarget;
    if (
      next instanceof Element &&
      (popup?.host.contains(next) || current?.anchor.contains(next))
    )
      return;
    hovered = false;
    laterHide();
  },
  true,
);
document.addEventListener(
  "focusin",
  (event) => {
    if (event.target instanceof Element) enter(event.target);
  },
  true,
);
document.addEventListener(
  "focusout",
  (event) => {
    if (
      event.relatedTarget instanceof Element &&
      current?.anchor.contains(event.relatedTarget)
    )
      return;
    laterHide();
  },
  true,
);
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape" && popup) {
      event.stopImmediatePropagation();
      event.preventDefault();
      hide();
    }
  },
  true,
);
window.addEventListener("scroll", () => popup?.position(), {
  passive: true,
  capture: true,
});
window.addEventListener("resize", () => popup?.position());
window.addEventListener("popstate", hide);
window.addEventListener("pagehide", hide);
const observer = new MutationObserver((records) => {
  if (
    scheduled ||
    !records.some(
      (r) => !(r.target instanceof Element && r.target.closest(`#${HOST_ID}`)),
    )
  )
    return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (lastUrl !== location.href) {
      lastUrl = location.href;
      hide();
      return;
    }
    if (!current) return;
    if (popup && topDialog() !== dialog) {
      hide();
      return;
    }
    if (!current.anchor.isConnected) {
      if (!popup?.isPinned) hide();
      return;
    }
    const next = resolveCard(current.anchor);
    if (!next) {
      if (!popup?.isPinned) hide();
      return;
    }
    if (contextKey(next) !== contextKey(current)) {
      if (popup?.isPinned) {
        current = next;
        void show(next);
        return;
      }
      const wasHovered = hovered;
      hide();
      if (wasHovered) enter(next.anchor);
    }
  });
});
observer.observe(document.body, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["class", "href", "src", "aria-label", "open", "hidden"],
});
void readSettings()
  .then((s) => {
    settings = s;
    overlays.setSettings(s);
    if (!settings.enabled) hide();
  })
  .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area === "local" &&
    Object.keys(changes).some((key) => key.startsWith("kosmore.friend."))
  ) {
    popup?.refreshTrade();
    overlays.invalidate();
    if (popup && current && activeRequest)
      loadHeaderSignals(popup, current, activeRequest.signal);
  }
  if (area === "local" && changes[SETTINGS_KEY]) {
    settings = parseSettings(changes[SETTINGS_KEY].newValue);
    overlays.setSettings(settings);
    if (!settings.enabled) hide();
    else if (popup && current && activeRequest) {
      popup.setSettings(settings);
      loadHeaderSignals(popup, current, activeRequest.signal);
    }
  }
  if (
    area === "local" &&
    changes[MARKET_FINISHES_KEY] &&
    pendingFilterWrites === 0
  ) {
    marketFinishes = parseMarketFinishes(changes[MARKET_FINISHES_KEY].newValue);
    popup?.setFinishes(marketFinishes);
  }
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.tab ||
    (sender.url && sender.url !== chrome.runtime.getURL("background.js")) ||
    !isTabRequest(message)
  )
    return false;
  void (async () => {
    const account = await client.account();
    if (message.op === "session") return account;
    if (account.key !== message.accountKey)
      throw new Error(
        "Your Kosmora account changed. Refresh connected accounts.",
      );
    return client.albums();
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
