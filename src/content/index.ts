import { GameClient } from "../kosmora/client";
import { contextKey, HOST_ID, resolveCard, topDialog } from "../kosmora/dom";
import { isTabRequest, request } from "../shared/messages";
import {
  parsePopupState,
  type PopupState,
  type PopupLayoutChange,
} from "../shared/popup-layout";
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
import { NavigationHotkeys } from "./navigation";
import { SalesOverlays } from "./sales-overlays";
import { observePage } from "./page-changes";
import { FriendTooltip } from "./friend-tooltip";
import { ProfileReminders } from "./profile-reminders";
import { TradeInterest } from "./trade-interest";
import { MarketOutcomes } from "./market-outcomes";
import { HistoryResolver, listenToPageRelay } from "./sale-rate-feed";
import { saleObservations } from "./sale-observation-store";
import { FusionFamilyImpact } from "./fusion-family";
import { TooltipButtons } from "./tooltip-buttons";

const client = new GameClient();
const friendTooltip = new FriendTooltip(client, () => {
  if (popup && !popup.isPinned) laterHide();
});
new SocialReminders(client).start();
new ProfileReminders(client).start();
const tradeInterest = new TradeInterest(client);
tradeInterest.start();
const overlays = new CardOverlays(client);
overlays.start();
const salesOverlays = new SalesOverlays(client);
salesOverlays.start();
const fusionFamily = new FusionFamilyImpact(client);
fusionFamily.start();
const tooltipButtons = new TooltipButtons(openFromButton);
tooltipButtons.start();
new MarketOutcomes(saleObservations).start();
listenToPageRelay(saleObservations);
const historyResolver = new HistoryResolver(saleObservations);
client.onHistoryLoaded((subjectId, history, loadedAt) =>
  historyResolver.receive(subjectId, history, loadedAt),
);
client.onAuctionListings((listings) =>
  saleObservations.recordMany(
    listings.map((listing) => [
      listing.id,
      {
        subjectId: listing.subjectId,
        finish: listing.finish,
        outcome: "open",
        endsAt: Date.parse(listing.endsAt),
      },
    ]),
  ),
);
let settings = defaults();
let pinnedState: PopupState = { pinned: false, position: null };
const navigationHotkeys = new NavigationHotkeys(
  () => settings,
  client,
  navigationAway,
);
let marketFinishes: Finish[] = [...FINISHES];
let pendingFilterWrites = 0;
const preferencesReady = Promise.all([
  readMarketFinishes().catch(() => marketFinishes),
  request<PopupState>({ op: "popupState" })
    .then(parsePopupState)
    .catch(() => pinnedState),
  readSettings().catch(() => settings),
]).then(([finishes, state, savedSettings]) => {
  marketFinishes = finishes;
  settings = savedSettings;
  friendTooltip.setSettings(settings);
  void friendTooltip.restore();
  navigationHotkeys.start();
  pinnedState = state;
  overlays.setSettings(settings);
  salesOverlays.setSettings(settings);
  fusionFamily.setSettings(settings);
  tooltipButtons.setSettings(settings);
  if (!settings.enabled) hide();
  else if (pinnedState.pinned && !popup && !current) createView(null);
});
let current: CardContext | null = null,
  popup: Popup | undefined;
let activeRequest: AbortController | undefined,
  openTimer: ReturnType<typeof setTimeout> | undefined,
  closeTimer: ReturnType<typeof setTimeout> | undefined;
let headerSignalRequest = 0;
let lastUrl = location.href,
  hovered = false,
  buttonOpened = false,
  dialog: HTMLDialogElement | undefined;
function cancelClose() {
  clearTimeout(closeTimer);
}
function hide() {
  buttonOpened = false;
  clearTimeout(openTimer);
  cancelClose();
  activeRequest?.abort();
  activeRequest = undefined;
  popup?.dispose();
  popup = undefined;
  current = null;
}
function dismiss() {
  const source = buttonOpened ? current : null;
  hide();
  if (source) tooltipButtons.focus(source);
  pinnedState.pinned = false;
  void request<PopupState>({
    op: "popupLayout",
    change: { pinned: false },
  }).catch(() => {});
}
function navigationAway() {
  hovered = false;
  hide();
  if (settings.enabled && pinnedState.pinned) createView(null);
}
function checkUrl() {
  if (lastUrl === location.href) return;
  lastUrl = location.href;
  navigationAway();
}
function laterHide() {
  cancelClose();
  if (popup?.isPinned || buttonOpened) return;
  closeTimer = setTimeout(() => {
    if (
      !popup?.isPinned &&
      !hovered &&
      !popup?.host.matches(":hover") &&
      !popup?.shadow.activeElement &&
      !friendTooltip.keepsOpen(popup?.host)
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
  if (
    !settings.enabled ||
    current !== context ||
    (!buttonOpened && tooltipButtons.showing(context))
  )
    return;
  activeRequest?.abort();
  const placement = popup?.pinnedPlacement();
  popup?.dispose();
  current = context;
  const abort = new AbortController();
  activeRequest = abort;
  const view = createView(context, placement);
  const valid = () =>
    !abort.signal.aborted && popup === view && current === context;
  try {
    const account = await client.account(abort.signal, fresh);
    if (!valid()) return;
    view.setAccount(account, settings.pinnedAlbums[account.key] ?? [], fresh);
    loadHeaderSignals(view, context, abort.signal);
    const detail = client.insights(context.subjectId, abort.signal, fresh);
    void detail.then(
      async (d) => {
        if (!valid()) return;
        view.setInsights(d, fresh);
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
  } catch (error) {
    if (valid()) {
      view.insightsFailed(error);
      view.albumsFailed(error);
      for (const f of FINISHES) view.setHistory(f, new Error(messageOf(error)));
    }
  }
}
function createView(
  context: CardContext | null,
  placement = popup?.pinnedPlacement(),
) {
  dialog = topDialog();
  if (!placement && pinnedState.pinned)
    placement = {
      ...(pinnedState.position ??
        settings.popupPosition ?? {
          left: Math.max(12, innerWidth - settings.popupWidth - 12),
          top: 12,
        }),
      tab: "market",
    };
  const view = new Popup(
    context,
    client,
    () => {
      if (context) void show(context, true);
    },
    dismiss,
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
      if (!view.isPinned && !current) hide();
      else if (!view.isPinned && !hovered) laterHide();
    },
    (change) => saveLayout(view, change),
    friendTooltip,
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
  return view;
}
function saveLayout(view: Popup, change: PopupLayoutChange) {
  pinnedState = {
    pinned: change.pinned ?? pinnedState.pinned,
    position: change.position ?? pinnedState.position,
  };
  settings = {
    ...settings,
    popupPosition: change.position ?? settings.popupPosition,
    popupWidth: change.width ?? settings.popupWidth,
    popupHeight: change.height ?? settings.popupHeight,
  };
  void request<PopupState>({ op: "popupLayout", change }).catch((error) =>
    view.layoutFailed(error),
  );
}
function loadHeaderSignals(
  view: Popup,
  context: CardContext,
  signal: AbortSignal,
) {
  const request = ++headerSignalRequest,
    requestedSettings = settings;
  view.setSignals();
  const receive = (signals: import("./card-signals").CardSignals) => {
    if (
      !signal.aborted &&
      popup === view &&
      settings === requestedSettings &&
      request === headerSignalRequest
    )
      view.setSignals(signals);
  };
  void overlays
    .signals(context, requestedSettings, receive)
    .then(receive)
    .catch(() => {});
}
function enter(target: Element) {
  if (tooltipButtons.contains(target)) {
    clearTimeout(openTimer);
    cancelClose();
    return;
  }
  if (friendTooltip.contains(target)) {
    cancelClose();
    return;
  }
  if (target.closest(`#${HOST_ID}`)) {
    if (
      settings.outsideClickClosesTooltipOnly &&
      popup &&
      current !== popup.context
    ) {
      clearTimeout(openTimer);
      current = popup.context;
    }
    cancelClose();
    return;
  }
  const context = resolveCard(target);
  if (!context) {
    hovered = false;
    return;
  }
  if (buttonOpened || tooltipButtons.showing(context)) {
    clearTimeout(openTimer);
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
  if (popup?.isPinned || (settings.outsideClickClosesTooltipOnly && popup))
    clearTimeout(openTimer);
  else hide();
  current = context;
  openTimer = setTimeout(() => {
    if (current === context) void show(context);
  }, settings.hoverDelayMs);
}
function openFromButton(context: CardContext) {
  clearTimeout(openTimer);
  cancelClose();
  if (
    current &&
    popup &&
    current.anchor === context.anchor &&
    contextKey(current) === contextKey(context)
  ) {
    dismiss();
    return;
  }
  if (!popup?.isPinned) hide();
  hovered = false;
  buttonOpened = true;
  current = context;
  void show(context);
}
function insideTooltip(event: Event) {
  return event
    .composedPath()
    .some(
      (node) =>
        node === popup?.host ||
        (node instanceof Element && friendTooltip.contains(node)),
    );
}
function closeOnlyOutside(event: Event) {
  return (
    settings.outsideClickClosesTooltipOnly &&
    !!popup &&
    !popup.isPinned &&
    !insideTooltip(event)
  );
}
function consumeDismissal(event: Event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}
// Consume the entire press, including its later click after dismiss() removes the
// tooltip. Otherwise links, native pointer handlers, and selection still fire.
let outsidePress:
  { pointerId: number; button: number; expires: number } | undefined;
window.addEventListener(
  "pointerdown",
  (event) => {
    outsidePress = undefined;
    if (!closeOnlyOutside(event)) return;
    outsidePress = {
      pointerId: event.pointerId,
      button: event.button,
      expires: Infinity,
    };
    consumeDismissal(event);
    dismiss();
  },
  { capture: true, passive: false },
);
for (const type of [
  "pointerup",
  "pointercancel",
  "mousedown",
  "mouseup",
  "click",
  "auxclick",
  "contextmenu",
]) {
  window.addEventListener(
    type,
    (event) => {
      if (outsidePress && Date.now() > outsidePress.expires)
        outsidePress = undefined;
      if (outsidePress) {
        if (
          event instanceof PointerEvent &&
          type.startsWith("pointer") &&
          event.pointerId !== outsidePress.pointerId
        )
          return;
        if (
          event instanceof MouseEvent &&
          type !== "pointercancel" &&
          event.button !== outsidePress.button
        )
          return;
        consumeDismissal(event);
        if (
          ["click", "auxclick", "contextmenu", "pointercancel"].includes(type)
        )
          outsidePress = undefined;
        else if (type === "pointerup") outsidePress.expires = Date.now() + 1000;
      } else if (
        ["click", "auxclick"].includes(type) &&
        closeOnlyOutside(event)
      ) {
        // Keyboard/synthetic activation can arrive without a pointerdown.
        consumeDismissal(event);
        dismiss();
      }
    },
    { capture: true, passive: false },
  );
}
window.addEventListener("blur", () => {
  outsidePress = undefined;
});
document.addEventListener(
  "pointerdown",
  (event) => {
    if (!buttonOpened || popup?.isPinned) return;
    if (
      event
        .composedPath()
        .some(
          (node) =>
            (node instanceof Element && tooltipButtons.contains(node)) ||
            node === popup?.host ||
            (node instanceof Element && friendTooltip.contains(node)),
        )
    )
      return;
    dismiss();
  },
  true,
);
document.addEventListener(
  "pointerover",
  (event) => {
    if (
      event
        .composedPath()
        .some(
          (node) => node instanceof Element && node.matches(".friend-trigger"),
        )
    ) {
      clearTimeout(openTimer);
      current = popup?.context ?? null;
      cancelClose();
      return;
    }
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
      (popup?.host.contains(next) ||
        current?.anchor.contains(next) ||
        friendTooltip.contains(next))
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
    if (
      event
        .composedPath()
        .some(
          (node) => node instanceof Element && node.matches(".friend-trigger"),
        )
    ) {
      clearTimeout(openTimer);
      current = popup?.context ?? null;
      cancelClose();
      return;
    }
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
    if (
      event
        .composedPath()
        .some(
          (node) =>
            node instanceof Element &&
            node.hasAttribute("data-kosmore-profile"),
        )
    )
      return;
    if (event.key === "Escape" && popup) {
      event.stopImmediatePropagation();
      event.preventDefault();
      dismiss();
    }
  },
  true,
);
window.addEventListener("scroll", () => popup?.position(), {
  passive: true,
  capture: true,
});
window.addEventListener("resize", () => popup?.position());
window.addEventListener("popstate", checkUrl);
window.addEventListener("hashchange", checkUrl);
const navigation = (window as Window & { navigation?: EventTarget }).navigation;
navigation?.addEventListener("navigatesuccess", checkUrl);
window.addEventListener("pagehide", hide);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) navigationAway();
});
observePage(() => {
  if (lastUrl !== location.href) {
    checkUrl();
    return;
  }
  if (popup && topDialog() !== dialog) {
    if (popup.isPinned) {
      dialog = topDialog();
      popup.mount();
    } else {
      hide();
      return;
    }
  }
  if (popup?.isPinned && !popup.host.isConnected) popup.mount();
  if (!current) return;
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
    if (settings.useOverlayButtonInsteadOfHover) {
      navigationAway();
      return;
    }
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
client.onAccountChange(() => {
  tradeInterest.refresh();
  friendTooltip.reset();
  navigationAway();
  overlays.invalidate();
  salesOverlays.invalidate();
});
const recheckAccount = () => {
  void client.account().catch(() => {});
};
window.addEventListener("focus", recheckAccount);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) recheckAccount();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") saleObservations.external(changes);
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
    const previousOverlayMode = settings.useOverlayButtonInsteadOfHover;
    settings = parseSettings(changes[SETTINGS_KEY].newValue);
    if (previousOverlayMode !== settings.useOverlayButtonInsteadOfHover)
      navigationAway();
    friendTooltip.setSettings(settings);
    navigationHotkeys.settingsChanged();
    overlays.setSettings(settings);
    salesOverlays.setSettings(settings);
    fusionFamily.setSettings(settings);
    tooltipButtons.setSettings(settings);
    if (!settings.enabled) hide();
    else if (popup) {
      popup.setSettings(settings);
      if (current && activeRequest)
        loadHeaderSignals(popup, current, activeRequest.signal);
    } else if (pinnedState.pinned) {
      createView(null);
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
