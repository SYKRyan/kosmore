import { setRequestPriority } from "../shared/request-scheduler";
import { NativeReadCache } from "../shared/native-read-cache";
import { GameClient } from "../kosmora/client";
import { contextKey, HOST_ID, resolveCard, topDialog } from "../kosmora/dom";
import { isTabRequest, request } from "../shared/messages";
import {
  parsePopupState,
  POPUP_PIN_KEY,
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
  type Settings,
  type Finish,
} from "../shared/types";
import {
  MARKET_FINISHES_KEY,
  parseMarketFinishes,
  readMarketFinishes,
  saveMarketFinishes,
} from "../shared/market-preferences";
import { Popup } from "./popup";
import { CardOverlays } from "./card-overlays";
import { NavigationHotkeys } from "./navigation";
import { PACK_FOCUS, PackOpeningHotkeys } from "./pack-opening-hotkeys";
import { SalesOverlays } from "./sales-overlays";
import { observePage } from "./page-changes";
import { FriendTooltip } from "./friend-tooltip";
import { ProfileReminders } from "./profile-reminders";
import { TradeInterest } from "./trade-interest";
import { MarketOutcomes } from "./market-outcomes";
import { HistoryResolver, listenToPageRelay } from "./sale-rate-feed";
import { finishOf } from "../shared/sale-observations";
import { saleObservations } from "./sale-observation-store";
import { FusionFamilyImpact } from "./fusion-family";
import { FAMILY_IMPACT_AVAILABLE } from "../shared/feature-availability";
import { TooltipButtons } from "./tooltip-buttons";
import {
  RELAY_LISTED,
  RELAY_CARDS,
  CARD_FEED_PATH,
  CARD_DETAILS_PATH,
  AUCTION_DETAILS_PATH,
  CARD_PRICES_PATH,
  RELAY_PACK,
  RELAY_READY,
  LISTING_WRITES,
} from "../shared/page-relay";
import { SERVICES_STATE_KEY, validCardId } from "../shared/services";
import { saleStatusKey, type SaleStatusCache } from "../shared/sale-status";
import { settingsForPage } from "../shared/page-settings";
import {
  HOVER_TOOLTIP,
  isTyping,
  shortcutFromEvent,
  shortcutKey,
} from "../shared/hotkeys";
import { RemainingPacks } from "./remaining-packs";
import { startGiftHandoff } from "./gift-handoff";

function pageSettings() {
  return settingsForPage(settings, location.pathname);
}

const client = new GameClient(
  undefined,
  new NativeReadCache(chrome.storage.local),
);
startGiftHandoff(client);
const friendTooltip = new FriendTooltip(client, () => {
  if (popup && !popup.isPinned) laterHide();
});
new ProfileReminders(client, "social").start();
new ProfileReminders(client).start();
const tradeInterest = new TradeInterest(client);
tradeInterest.start();
const overlays = new CardOverlays(client);
overlays.start();
const salesOverlays = new SalesOverlays(client);
salesOverlays.start();
const fusionFamily = FAMILY_IMPACT_AVAILABLE
  ? new FusionFamilyImpact(client)
  : undefined;
fusionFamily?.start();
const tooltipButtons = new TooltipButtons(openFromButton);
tooltipButtons.start();
const marketOutcomes = new MarketOutcomes(saleObservations);
const historyResolver = new HistoryResolver(saleObservations);
window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    !event.data
  )
    return;
  void preferencesReady.then(() => {
    if (event.data.type === RELAY_CARDS) {
      if (
        !needsServicesCards() ||
        typeof event.data.path !== "string" ||
        !Array.isArray(event.data.ids) ||
        event.data.ids.length > 500
      )
        return;
      let url: URL;
      try {
        url = new URL(event.data.path, location.origin);
      } catch {
        return;
      }
      if (url.origin !== location.origin || !CARD_FEED_PATH.test(url.pathname))
        return;
      client.observeCardIds(event.data.ids.filter(validCardId));
      const detail = CARD_DETAILS_PATH.exec(url.pathname);
      if (detail) {
        const at = event.data.startedAt;
        void client
          .observeCardDetails(
            event.data.data,
            Number.isSafeInteger(at) && at > 0 && at <= Date.now()
              ? at
              : undefined,
          )
          .then(() => {
            overlays.refreshSaleStatus(new Set([detail[1]]));
            if (current?.subjectId === detail[1] && popup) void show(current);
          });
      }
      const price = CARD_PRICES_PATH.exec(url.pathname);
      const finish = url.searchParams.get("finish");
      if (price && FINISHES.some((value) => value === finish))
        client.observeMarketHistory(
          price[1],
          finish as Finish,
          event.data.data,
        );
      const ownAuction = AUCTION_DETAILS_PATH.exec(url.pathname);
      if (ownAuction && event.data.data && tracksListingPrices())
        void client
          .observeOwnAuction(ownAuction[1], event.data.data)
          .catch(() => {});
      if (url.pathname === "/api/me/auctions" && tracksListingPrices())
        void client.observeOwnListings(event.data.data).catch(() => {});
      if (url.pathname === "/api/collection")
        client.observeCollection(url.href, event.data.data);
      return;
    }
    if (event.data.type === RELAY_PACK) {
      if (event.data.kind === "identity") {
        const observed = client.observeIdentity(event.data.data) ?? "";
        void chrome.storage.local.set({ "kosmore.gameAccountHint": observed });
      }
      if (event.data.kind === "inventory" && settings.showRemainingPackCount) {
        try {
          client.observeInventory(event.data.data, event.data.href);
        } catch {}
      }
      if (event.data.kind === "opening" && pageSettings().enabled)
        void client.receivePackData(event.data).catch(() => {});
      return;
    }
    if (event.data.type !== RELAY_LISTED || typeof event.data.path !== "string")
      return;
    const trackPrices = tracksListingPrices();
    if (!trackPrices && !tracksSaleStatus()) return;
    if (LISTING_WRITES.test(event.data.path))
      void client
        .captureListings(event.data.listings, {
          savePrices: trackPrices,
          confirmedAt: event.data.confirmedAt,
        })
        .catch(() => {});
    else if (
      event.data.canceled &&
      AUCTION_DETAILS_PATH.exec(event.data.path)?.[1]?.toLowerCase() ===
        event.data.canceled.auctionId
    )
      void client
        .captureListings([event.data.canceled], { canceled: true })
        .catch(() => {});
  });
});
let settings = defaults();
function tracksSaleStatus() {
  return settings.cardOverlaysEnabled && settings.showOnSaleOverlay;
}
function tracksListingPrices() {
  return (
    settings.enabled ||
    (settings.salesOverlaysEnabled &&
      (settings.showSalesMyLastListing || settings.salesDiscountEnabled))
  );
}
function needsServicesCards() {
  const page = pageSettings();
  return (
    page.enabled ||
    page.cardOverlaysEnabled ||
    settings.salesOverlaysEnabled ||
    (FAMILY_IMPACT_AVAILABLE && settings.familyImpactOverlaysEnabled) ||
    settings.friendTooltipEnabled ||
    settings.showTradePossibleInterest
  );
}
let cardRefresh: ReturnType<typeof setTimeout> | undefined;
const changedCards = new Map<string, number | undefined>();
function refreshServiceControls(
  ids?: string[],
  firstFetchedAt?: Record<string, number>,
) {
  if (!ids) {
    clearTimeout(cardRefresh);
    cardRefresh = undefined;
    changedCards.clear();
    client.clearServiceViews();
    overlays.invalidate();
    salesOverlays.invalidate();
    if (popup && current) void show(current);
    return;
  }
  for (const id of ids)
    if (!changedCards.has(id) || firstFetchedAt?.[id] === undefined)
      changedCards.set(id, firstFetchedAt?.[id]);
  cardRefresh ??= setTimeout(() => {
    cardRefresh = undefined;
    // A cold read usually installs its own result before the broadcast settles.
    // Replacements must also refresh older badges held by other consumers.
    const affected = new Set<string>();
    for (const [id, first] of changedCards)
      if (client.serviceCardChanged(id, first)) affected.add(id);
    changedCards.clear();
    if (!affected.size) return;
    overlays.refreshCards(affected);
    salesOverlays.refreshCards(affected);
    if (popup && current && affected.has(current.subjectId)) void show(current);
  }, 80);
}
function syncRelayPreferences() {
  const family =
    FAMILY_IMPACT_AVAILABLE && settings.familyImpactOverlaysEnabled;
  const saleFamily = family && settings.showSalesFamilyOverlay;
  const listingPrices = tracksListingPrices();
  window.postMessage(
    {
      type: RELAY_READY,
      preferences: {
        servicesCards: needsServicesCards(),
        packOpenings: pageSettings().enabled,
        inventory: settings.showRemainingPackCount,
        fusion: family && settings.showFusionFamilyOverlay,
        vortex: family && settings.showVortexFamilyOverlay,
        familyMilestones:
          family &&
          (settings.showFusionFamilyOverlay ||
            settings.showVortexFamilyOverlay ||
            settings.showTradeFamilyOverlay ||
            settings.showSalesFamilyOverlay),
        saleFamily,
        listingPrices: listingPrices || tracksSaleStatus(),
        listingChanges: listingPrices || saleFamily || tracksSaleStatus(),
      },
    },
    location.origin,
  );
}
const remainingPacks = new RemainingPacks(
  client,
  () => settings.showRemainingPackCount,
);
let pinnedState: PopupState = { pinned: false, position: null };
const navigationHotkeys = new NavigationHotkeys(
  () => settings,
  client,
  navigationAway,
);
const packOpeningHotkeys = new PackOpeningHotkeys(
  () => settings,
  openFromKeyboard,
  closeKeyboardTooltip,
  navigationAway,
  (element) => element === popup?.host || friendTooltip.contains(element),
  () =>
    !!(
      popup?.isPinned &&
      popup.host.matches(":popover-open") &&
      pageSettings().enabled
    ),
);
let marketFinishes: Finish[] = [...FINISHES];
let pendingFilterWrites = 0;
let updateTooltipHistory: ((finishes: Finish[]) => void) | undefined;
const preferencesReady = Promise.all([
  readMarketFinishes().catch(() => marketFinishes),
  request<PopupState>({ op: "popupState" })
    .then(parsePopupState)
    .catch(() => pinnedState),
  readSettings().catch(() => settings),
]).then(([finishes, state, savedSettings]) => {
  marketFinishes = finishes;
  settings = savedSettings;
  marketOutcomes.start();
  listenToPageRelay(saleObservations, window, false);
  client.onHistoryLoaded((id, history, loadedAt) =>
    historyResolver.receive(id, history, loadedAt),
  );
  syncRelayPreferences();
  friendTooltip.setSettings(pageSettings());
  void friendTooltip.restore();
  navigationHotkeys.start();
  pinnedState = state;
  overlays.setSettings(settings);
  salesOverlays.setSettings(settings);
  fusionFamily?.setSettings(settings);
  tooltipButtons.setSettings(settings);
  if (!pageSettings().enabled) hide();
  else if (pinnedState.pinned && !popup && !current) createView(null);
  packOpeningHotkeys.start();
  remainingPacks.start();
});
let current: CardContext | null = null,
  popup: Popup | undefined;
let activeRequest: AbortController | undefined,
  openTimer: ReturnType<typeof setTimeout> | undefined,
  closeTimer: ReturnType<typeof setTimeout> | undefined;
let headerSignalRequest = 0;
let headerSignalsAbort: AbortController | undefined;
let lastUrl = location.href,
  hovered = false,
  buttonOpened = false,
  keyboardOpened = false,
  dialog: HTMLDialogElement | undefined;
function cancelClose() {
  clearTimeout(closeTimer);
}
function hide() {
  buttonOpened = false;
  keyboardOpened = false;
  clearTimeout(openTimer);
  cancelClose();
  activeRequest?.abort();
  activeRequest = undefined;
  updateTooltipHistory = undefined;
  popup?.dispose();
  popup = undefined;
  current = null;
}
function dismiss() {
  const source = buttonOpened ? current : null;
  hide();
  if (source) tooltipButtons.focus(source);
}
function navigationAway() {
  hovered = false;
  hide();
  if (pageSettings().enabled && pinnedState.pinned) createView(null);
}
function checkUrl() {
  if (lastUrl === location.href) return;
  const previousUrl = new URL(lastUrl);
  const previous = settingsForPage(settings, previousUrl.pathname);
  lastUrl = location.href;
  syncRelayPreferences();
  if (packOpeningHotkeys.keepFocusOnRecap(previousUrl)) {
    const recap = current && resolveCard(current.anchor);
    if (recap && current && contextKey(recap) !== contextKey(current))
      openFromKeyboard(recap);
    return;
  }
  packOpeningHotkeys.reset();
  friendTooltip.setSettings(pageSettings());
  tooltipButtons.setSettings(settings);
  if (previous.cardOverlaysEnabled !== pageSettings().cardOverlaysEnabled)
    overlays.invalidate();
  navigationAway();
}
function laterHide() {
  cancelClose();
  if (popup?.isPinned || buttonOpened || keyboardOpened) return;
  closeTimer = setTimeout(() => {
    if (
      !popup?.isPinned &&
      !keyboardOpened &&
      !hovered &&
      !popup?.host.matches(":hover") &&
      !popup?.shadow.activeElement &&
      !friendTooltip.keepsOpen(popup?.host)
    )
      hide();
  }, settings.dismissDelayMs);
}
function options(section?: "stat-boxes") {
  void chrome.runtime
    .sendMessage({ requestId: crypto.randomUUID(), op: "openOptions", section })
    .catch(() => {});
}
async function show(
  context: CardContext,
  { fresh = false, fromHover = false } = {},
) {
  await preferencesReady;
  if (
    !pageSettings().enabled ||
    current !== context ||
    (!buttonOpened && !keyboardOpened && tooltipButtons.showing(context))
  )
    return;
  activeRequest?.abort();
  const placement = popup?.pinnedPlacement();
  popup?.dispose();
  current = context;
  const abort = new AbortController();
  setRequestPriority(abort.signal, "interactive");
  activeRequest = abort;
  updateTooltipHistory = undefined;
  const view = createView(context, placement);
  if (
    fromHover &&
    settings.tooltipTakesFocus &&
    context.anchor.matches(":hover")
  ) {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement)
      active = active.shadowRoot.activeElement;
    if (active instanceof HTMLElement || active instanceof SVGElement)
      active.blur();
  }
  const valid = () =>
    !abort.signal.aborted && popup === view && current === context;
  try {
    if (
      settings.pinnedAlbumsEnabled &&
      Object.values(settings.pinnedAlbums).some((ids) => ids.length)
    )
      void view.loadPrivateAccount();
    view.showCachedAuction(fresh);
    loadHeaderSignals(view, context, abort.signal);
    const detail =
      client.hasObservedCopies(context.subjectId) && !client.displayAccount
        ? client
            .account(abort.signal, false)
            .then(() => client.insights(context.subjectId, abort.signal, fresh))
        : client.insights(context.subjectId, abort.signal, fresh);
    void detail.then(
      (d) => {
        if (!valid()) return;
        view.setInsights(d, fresh);
        if (d.copies.length) void view.loadPrivateAccount();
      },
      (error) => {
        if (valid()) view.insightsFailed(error);
      },
    );
    const historyJobs = new Map<Finish, AbortController>();
    const settled = new Set<Finish>();
    updateTooltipHistory = (finishes) => {
      if (!valid()) return;
      const needed = [...new Set([finishOf(context.variant), ...finishes])];
      for (const [finish, job] of historyJobs) {
        if (needed.includes(finish)) continue;
        job.abort();
        historyJobs.delete(finish);
      }
      for (const finish of needed) {
        if (historyJobs.has(finish) || settled.has(finish)) continue;
        const job = new AbortController();
        historyJobs.set(finish, job);
        const signal = AbortSignal.any([abort.signal, job.signal]);
        setRequestPriority(signal, "interactive");
        const hit = client.peekHistory(context.subjectId, finish);
        if (hit && Date.now() - hit.until < 86_400_000)
          view.setHistory(finish, hit.value, fresh || hit.stale);
        void client
          .history(context.subjectId, finish, signal, fresh)
          .then(
            (history) => {
              if (signal.aborted || !valid()) return;
              settled.add(finish);
              view.setHistory(
                finish,
                history,
                client.peekHistory(context.subjectId, finish)?.stale,
              );
            },
            (error) => {
              if (signal.aborted || !valid()) return;
              view.setHistory(
                finish,
                error instanceof Error ? error : new Error(messageOf(error)),
              );
            },
          )
          .finally(() => {
            if (historyJobs.get(finish) === job) historyJobs.delete(finish);
          });
      }
    };
    updateTooltipHistory(marketFinishes);
  } catch (error) {
    if (valid()) {
      view.insightsFailed(error);
      view.albumsFailed(error);
      for (const f of FINISHES) view.setHistory(f, new Error(messageOf(error)));
    }
  }
}
function pinPosition() {
  return pinnedState.position ?? settings.popupPosition ?? {
    left: Math.max(12, innerWidth - settings.popupWidth - 12),
    top: 12,
  };
}
function createView(
  context: CardContext | null,
  placement = popup?.pinnedPlacement(),
) {
  dialog = topDialog();
  if (!placement && pinnedState.pinned)
    placement = {
      ...pinPosition(),
      tab: pinnedState.tab ?? "market",
    };
  const view = new Popup(
    context,
    client,
    () => {
      if (!context) return;
      const signal = activeRequest?.signal;
      void client
        .refreshCachedCard(context.subjectId, signal)
        .then(() => {
          if (popup !== view || signal?.aborted) return;
          for (const finish of FINISHES) {
            const hit = client.peekHistory(context.subjectId, finish);
            if (hit) view.setHistory(finish, hit.value, hit.stale);
          }
          view.showCachedAuction();
        })
        .catch(() => {});
    },
    dismiss,
    options,
    marketFinishes,
    async (finishes) => {
      marketFinishes = [...finishes];
      updateTooltipHistory?.(marketFinishes);
      pendingFilterWrites++;
      try {
        await saveMarketFinishes(finishes);
      } finally {
        pendingFilterWrites--;
      }
    },
    pageSettings(),
    placement,
    () => {
      cancelClose();
      if (view.isPinned && keyboardOpened)
        packOpeningHotkeys.restoreCardFocus();
      else if (!view.isPinned && !current) hide();
      else if (!view.isPinned && !hovered) laterHide();
    },
    (change) => saveLayout(view, change),
    friendTooltip,
    pinnedState.tab,
  );
  popup = view;
  view.host.addEventListener("mousedown", (event) => {
    if (!view.isPinned || !context || event.button !== 0) return;
    const active = document.activeElement;
    if (
      !(active instanceof HTMLElement) ||
      resolveCard(active)?.anchor !== context.anchor
    )
      return;
    const targets = event.composedPath().flatMap((node) => {
      const target = node instanceof HTMLLabelElement ? node.control : node;
      return target instanceof HTMLElement ? [target] : [];
    });
    const choice = targets.find((target) =>
      target.matches('select, input[type="checkbox"], input[type="radio"]'),
    );
    if (choice) {
      // Native labels and pickers may focus their control during activation.
      const pointerChoice = new AbortController();
      choice.addEventListener("blur", () => pointerChoice.abort(), {
        once: true,
        signal: pointerChoice.signal,
      });
      choice.addEventListener(
        "change",
        () => {
          pointerChoice.abort();
          if (popup === view && view.isPinned && active.isConnected)
            active.focus({ preventScroll: true });
        },
        { capture: true, once: true, signal: pointerChoice.signal },
      );
    }
    if (
      targets.some(
        (target) =>
          target.isContentEditable ||
          target.matches(
            'textarea, select, input:not([type="checkbox"], [type="radio"])',
          ),
      )
    )
      return;
    // Keep focus on the card while allowing the tooltip's click action to run.
    event.preventDefault();
  });
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
    ...pinnedState,
    ...(change.tab ? { tab: change.tab } : {}),
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
  headerSignalsAbort?.abort();
  headerSignalsAbort = new AbortController();
  const demand = AbortSignal.any([signal, headerSignalsAbort.signal]);
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
    .signals(context, requestedSettings, receive, demand)
    .then(receive)
    .catch(() => {});
}
function enter(target: Element, pointer?: PointerEvent) {
  if (!pageSettings().enabled) return;
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
  if (!pointer && (keyboardOpened || target.hasAttribute(PACK_FOCUS))) return;
  const context = resolveCard(target);
  if (!context) {
    hovered = false;
    return;
  }
  if (buttonOpened || tooltipButtons.showing(context)) {
    clearTimeout(openTimer);
    return;
  }
  packOpeningHotkeys.inspectSummaryCard(context);
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
  keyboardOpened = false;
  current = context;
  const fromHover = !!pointer && pointer.pointerType !== "touch";
  openTimer = setTimeout(() => {
    if (current === context) void show(context, { fromHover });
  }, settings.hoverDelayMs);
}
function openFromButton(context: CardContext) {
  packOpeningHotkeys.inspectSummaryCard(context);
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
function openFromKeyboard(context: CardContext) {
  if (!pageSettings().enabled) return;
  clearTimeout(openTimer);
  cancelClose();
  if (
    keyboardOpened &&
    popup &&
    current?.anchor === context.anchor &&
    contextKey(current) === contextKey(context)
  )
    return;
  buttonOpened = false;
  keyboardOpened = true;
  hovered = false;
  current = context;
  void show(context);
}
function closeKeyboardTooltip() {
  if (keyboardOpened) navigationAway();
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
  if (
    event instanceof MouseEvent &&
    event.type === "click" &&
    event.detail === 0 &&
    event.target instanceof Element &&
    event.target.closest(`[${PACK_FOCUS}]`)
  )
    return false;
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
    if (
      (!buttonOpened && !(settings.fullScreenCenteredOnOpen && popup)) ||
      popup?.isPinned
    )
      return;
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
    if (event.target instanceof Element) enter(event.target, event);
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
const heldTooltipKeys = new Set<string>();
window.addEventListener(
  "keyup",
  (event) => heldTooltipKeys.delete(event.code),
  true,
);
window.addEventListener("blur", () => heldTooltipKeys.clear());
window.addEventListener(
  "keydown",
  (event) => {
    const view = popup;
    const open = view?.host.matches(":popover-open");
    if (
      !settings.hotkeysEnabled ||
      event.defaultPrevented ||
      (!open && !(event.repeat && heldTooltipKeys.has(event.code))) ||
      isTyping(event) ||
      (location.pathname === "/packs/open" &&
        document.querySelector(".ko-summary .ko-drop"))
    )
      return;
    const dialog = topDialog();
    if (dialog && (!view || !dialog.contains(view.host))) return;
    if (event.repeat) {
      if (heldTooltipKeys.has(event.code)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    heldTooltipKeys.delete(event.code);
    if (!view || !open) return;
    const shortcut = shortcutFromEvent(event, true);
    if (!shortcut) return;
    const key = shortcutKey(shortcut);
    const action = settings.hoverTooltipHotkeysEnabled
      ? HOVER_TOOLTIP.find(({ id }) => {
          const binding = settings.hoverTooltipHotkeys[id];
          return binding && shortcutKey(binding) === key;
        })
      : undefined;
    if (action) {
      if (!view.activateShortcut(action.id)) return;
      heldTooltipKeys.add(event.code);
    } else if (!view.activateAlbumShortcut(key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
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
window.addEventListener(
  "wheel",
  (event) => popup?.restoreCanceledWheel(event),
  { capture: true, passive: true },
);
for (const type of [
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
] as const)
  window.addEventListener(type, (event) => popup?.restoreCanceledTouch(event), {
    capture: true,
    passive: true,
  });
window.addEventListener("scroll", () => popup?.position(), {
  passive: true,
  capture: true,
});
window.addEventListener("resize", () => popup?.position());
window.visualViewport?.addEventListener("resize", () => popup?.position());
window.visualViewport?.addEventListener("scroll", () => popup?.position());
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
let saleRevision = 0;
function applySaleChanges(next?: SaleStatusCache, before?: SaleStatusCache) {
  saleRevision++;
  client.setSaleCache(next);
  const ids = new Set<string>();
  for (const row of [
    ...Object.values(before?.changes ?? {}),
    ...Object.values(next?.changes ?? {}),
  ])
    if (row.subjectId) ids.add(row.subjectId);
  overlays.refreshSaleStatus(ids);
}
client.onVerifiedAccount = (account) => {
  const key = saleStatusKey(account.key);
  const revision = ++saleRevision;
  void chrome.storage.local
    .get(key)
    .then((data) => {
      if (
        revision === saleRevision &&
        client.displayAccount?.key === account.key
      )
        applySaleChanges(data[key] as SaleStatusCache | undefined);
    })
    .catch(() => {});
  if (tracksListingPrices())
    void request({
      op: "listingAccountVerified",
      accountKey: account.key,
      subjectId: "0",
    }).catch(() => {});
};
client.onAccountChange(() => {
  tradeInterest.refresh();
  friendTooltip.reset();
  navigationAway();
  overlays.invalidate();
  salesOverlays.invalidate();
});
client.onListingsChanged(() => {
  popup?.invalidateListingHistory();
  salesOverlays.invalidateListings();
});
const recheckAccount = () => {
  if (
    client.displayAccount &&
    (popup?.usesPrivateData ||
      (overlays.enabled() &&
        (settings.showOnSaleOverlay || settings.showFriendInterestOverlay)) ||
      (salesOverlays.enabled() && settings.salesDiscountEnabled) ||
      fusionFamily?.enabled())
  )
    void client.account().catch(() => {});
};
window.addEventListener("focus", recheckAccount);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) recheckAccount();
});
function applySettings(next: Settings) {
  const previous = settings;
  settings = next;
  // Stat preferences only change what the tooltip draws from its local snapshot.
  if (
    JSON.stringify({
      ...previous,
      stats: next.stats,
      statBoxesEnabled: next.statBoxesEnabled,
    }) === JSON.stringify(next)
  ) {
    popup?.setStatSettings(pageSettings());
    return;
  }
  syncRelayPreferences();
  if (
    previous.useOverlayButtonInsteadOfHover !==
    settings.useOverlayButtonInsteadOfHover
  )
    navigationAway();
  friendTooltip.setSettings(pageSettings());
  navigationHotkeys.settingsChanged();
  if (previous.packOpeningHotkeysEnabled && !settings.packOpeningHotkeysEnabled)
    packOpeningHotkeys.reset();
  else if (!settings.hotkeysEnabled) packOpeningHotkeys.cancelHotkeyActions();
  if (!settings.hotkeysEnabled || !settings.hoverTooltipHotkeysEnabled)
    heldTooltipKeys.clear();
  overlays.setSettings(settings);
  salesOverlays.setSettings(settings);
  fusionFamily?.setSettings(settings);
  tooltipButtons.setSettings(settings);
  if (!pageSettings().enabled) hide();
  else if (popup) {
    popup.setSettings(pageSettings());
    updateTooltipHistory?.(marketFinishes);
    if (current && activeRequest)
      loadHeaderSignals(popup, current, activeRequest.signal);
  } else if (pinnedState.pinned && !settingsForPage(previous, location.pathname).enabled) {
    createView(null);
  }
  packOpeningHotkeys.dismissFoundPackAutomatically();
  remainingPacks.refresh();
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[POPUP_PIN_KEY]) {
    const { pinned, position } = parsePopupState(changes[POPUP_PIN_KEY].newValue);
    void preferencesReady.then(() => {
      const wasPinned = pinnedState.pinned;
      pinnedState = { ...pinnedState, pinned, position };
      if (!pageSettings().enabled) return;
      if (popup) popup.setPinnedPlacement(pinned ? pinPosition() : undefined);
      else if (pinned && !wasPinned && !current) createView(null);
    });
  }
  if (area === "local" && client.displayAccount) {
    const sale = changes[saleStatusKey(client.displayAccount.key)];
    if (sale)
      applySaleChanges(
        sale.newValue as SaleStatusCache | undefined,
        sale.oldValue as SaleStatusCache | undefined,
      );
  }
  const observed = changes["kosmore.gameAccountHint"]?.newValue;
  if (
    area === "local" &&
    typeof observed === "string" &&
    client.displayAccount &&
    client.displayAccount.key !== observed
  )
    client.observeIdentity(null);
  if (area === "local" && changes[SERVICES_STATE_KEY]) refreshServiceControls();
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
  if (area === "local" && changes[SETTINGS_KEY])
    applySettings(parseSettings(changes[SETTINGS_KEY].newValue));
  if (
    area === "local" &&
    changes[MARKET_FINISHES_KEY] &&
    pendingFilterWrites === 0
  ) {
    marketFinishes = parseMarketFinishes(changes[MARKET_FINISHES_KEY].newValue);
    popup?.setFinishes(marketFinishes);
    updateTooltipHistory?.(marketFinishes);
  }
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.tab ||
    (sender.url && sender.url !== chrome.runtime.getURL("background.js"))
  )
    return false;
  if (
    message?.op === "servicesCardsChanged" &&
    Array.isArray(message.ids) &&
    message.ids.length <= 100 &&
    message.ids.every(validCardId)
  ) {
    refreshServiceControls(message.ids, message.firstFetchedAt);
    return false;
  }
  if (
    message?.op === "confirmedListingsChanged" &&
    message.account === client.displayAccount?.key
  ) {
    salesOverlays.invalidateListings();
    return false;
  }
  if (!isTabRequest(message)) return false;
  if (message.op === "listingCacheChanged") {
    client.listingsChanged(message.accountKey);
    respond({ requestId: message.requestId, ok: true, data: null });
    return false;
  }
  if (message.op === "readListingBatch" || message.op === "cancelListingBatch")
    return false;
  void (async () => {
    const account = await client.account();
    if (message.op === "session") return account;
    if (account.key !== message.accountKey)
      throw new Error(
        "Your Kosmora account changed. Refresh connected accounts.",
      );
    return message.op === "listFamilies"
      ? client.families(undefined, true)
      : client.albums();
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
