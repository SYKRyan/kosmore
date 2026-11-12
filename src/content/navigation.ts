import {
  isTyping,
  NAVIGATION,
  shortcutFromEvent,
  shortcutKey,
  type NavigationId,
} from "../shared/hotkeys";
import { messageOf, type KosmoraClient, type Settings } from "../shared/types";
const ALERTS_HASH = "#kosmore-alerts";
function alertsButton(): HTMLButtonElement | undefined {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(
      'button[data-testid="market-alerts"], button[data-testid="watch-open"]',
    ),
  ].find(
    (button) =>
      !button.disabled &&
      button.getClientRects().length > 0 &&
      !button.closest("[inert]"),
  );
}
export class NavigationHotkeys {
  private request = 0;
  private profileRequest?: AbortController;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private cancelAlerts?: () => void;
  constructor(
    private settings: () => Settings,
    private client: KosmoraClient,
    private beforeNavigate: () => void,
  ) {}
  private enabled() {
    const { hotkeysEnabled, navigationHotkeysEnabled } = this.settings();
    return hotkeysEnabled && navigationHotkeysEnabled;
  }
  start() {
    document.addEventListener(
      "keydown",
      (event) => {
        if (!this.enabled() || event.defaultPrevented || isTyping(event))
          return;
        const shortcut = shortcutFromEvent(event);
        if (!shortcut) return;
        const key = shortcutKey(shortcut),
          bindings = this.settings().hotkeys;
        const destination = NAVIGATION.find(
          (item) =>
            bindings[item.id] && shortcutKey(bindings[item.id]!) === key,
        );
        if (!destination) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.navigate(destination.id);
      },
      true,
    );
    this.openPendingAlerts();
    window.addEventListener("hashchange", () => this.openPendingAlerts());
  }
  settingsChanged() {
    if (!this.enabled()) {
      this.request++;
      this.profileRequest?.abort();
      this.cancelAlerts?.();
    } else this.openPendingAlerts();
  }
  private async navigate(id: NavigationId) {
    const sequence = ++this.request,
      from = location.href;
    this.profileRequest?.abort();
    const destination = NAVIGATION.find((item) => item.id === id)!;
    if (id === "marketAlerts" && location.pathname === "/market") {
      const button = alertsButton();
      if (button) {
        this.beforeNavigate();
        button.click();
        return;
      }
    }
    let path: string | null = destination.path;
    if (id === "profile") {
      const abort = new AbortController();
      this.profileRequest = abort;
      try {
        const account = await this.client.account(abort.signal, true);
        if (
          sequence !== this.request ||
          location.href !== from ||
          abort.signal.aborted ||
          !this.enabled()
        )
          return;
        path = `/u/${encodeURIComponent(account.handle)}`;
      } catch (error) {
        if (
          sequence === this.request &&
          location.href === from &&
          !abort.signal.aborted
        )
          this.notice(`Could not open My Profile: ${messageOf(error)}`);
        return;
      }
    }
    if (path) {
      this.beforeNavigate();
      location.assign(path);
    }
  }
  private openPendingAlerts() {
    this.cancelAlerts?.();
    if (!this.enabled()) return;
    if (location.pathname !== "/market" || location.hash !== ALERTS_HASH)
      return;
    const observer = new MutationObserver(() => attempt());
    const finish = () => {
      observer.disconnect();
      clearTimeout(timer);
      if (this.cancelAlerts === finish) this.cancelAlerts = undefined;
    };
    const attempt = () => {
      if (
        !this.enabled() ||
        location.pathname !== "/market" ||
        location.hash !== ALERTS_HASH
      ) {
        finish();
        return;
      }
      const button = alertsButton();
      if (!button) return;
      finish();
      history.replaceState(
        history.state,
        "",
        location.pathname + location.search,
      );
      button.click();
    };
    const timer = setTimeout(() => {
      finish();
      if (location.pathname === "/market" && location.hash === ALERTS_HASH)
        this.notice(
          "Market Alerts could not open. Use the Alerts button on Market, then try the shortcut again.",
        );
    }, 15000);
    this.cancelAlerts = finish;
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "disabled", "class"],
    });
    attempt();
  }
  private notice(text: string) {
    clearTimeout(this.noticeTimer);
    document.getElementById("kosmore-navigation-status")?.remove();
    const notice = document.createElement("div");
    notice.id = "kosmore-navigation-status";
    notice.setAttribute("role", "status");
    notice.textContent = text;
    notice.style.cssText =
      "position:fixed;bottom:20px;right:20px;max-width:420px;padding:14px;background:#241936;color:#fff0ce;border:1px solid #dabc7e;border-radius:10px;font:14px/1.5 system-ui;z-index:2147483647";
    document.body.append(notice);
    this.noticeTimer = setTimeout(() => notice.remove(), 10000);
  }
}
