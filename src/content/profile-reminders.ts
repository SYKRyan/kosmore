import { profilePlayer, type ProfilePlayer } from "../kosmora/profile";
import { readSettings, parseSettings, SETTINGS_KEY } from "../shared/settings";
import type { KosmoraClient } from "../shared/types";
import { observePage } from "./page-changes";
import { SocialReminders } from "./social";
import type { FriendReminders } from "./friend-reminders";
import { button, el } from "./ui";

export class ProfileReminders {
  private profile?: ProfilePlayer;
  private trigger?: HTMLElement;
  private toggle?: HTMLButtonElement;
  private view?: FriendReminders;
  private activated = false;
  private opened = false;
  private enabled = false;
  private pinned = false;
  private frame = 0;
  private savingPin = false;
  private pin = button(
    "",
    () => void this.setPinned(!this.pinned),
    "profile-pin",
  );
  private close = button("×", () => this.hidePopup(), "profile-close");
  private editor: SocialReminders;

  constructor(client: Pick<KosmoraClient, "account" | "families">) {
    // An SVG pushpin stays legible beside the small brand label.
    this.pin.innerHTML =
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-4 1-4 4v4l-2 2-3-5-5-3 2-2h4l4-4 1-4Z M8 16l-5 5"/></svg>';
    this.close.setAttribute("aria-label", "Close profile reminders");
    this.editor = new SocialReminders(client, {
      select: () =>
        this.enabled && this.activated ? (this.profile ?? null) : null,
      options: { profile: true, controls: [this.pin, this.close] },
      mount: (_friend, view) => {
        this.view = view;
        view.host.addEventListener("keydown", (event) => this.escape(event));
        this.layout();
        const observer = new ResizeObserver(() => this.position());
        observer.observe(view.host);
        return () => {
          observer.disconnect();
          if (view.host.matches(":popover-open")) view.host.hidePopover();
          if (this.view === view) this.view = undefined;
        };
      },
    });
  }
  start() {
    observePage(() => this.scan());
    for (const name of ["popstate", "hashchange"])
      window.addEventListener(name, () => this.scan());
    (
      window as Window & { navigation?: EventTarget }
    ).navigation?.addEventListener("navigatesuccess", () => this.scan());
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (
          this.opened &&
          !this.pinned &&
          !event
            .composedPath()
            .some((node) => node === this.trigger || node === this.view?.host)
        )
          this.hidePopup(false);
      },
      true,
    );
    document.addEventListener("keydown", (event) => this.escape(event));
    for (const name of ["resize", "scroll"])
      window.addEventListener(name, () => this.position(), {
        passive: true,
        capture: true,
      });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[SETTINGS_KEY])
        this.settings(changes[SETTINGS_KEY].newValue);
    });
    this.editor.start();
    void readSettings().then((settings) => this.settings(settings));
  }
  private escape(event: KeyboardEvent) {
    if (
      event.key !== "Escape" ||
      !this.opened ||
      this.pinned ||
      event.defaultPrevented
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.hidePopup();
  }
  private settings(raw: unknown) {
    const settings = parseSettings(raw);
    this.enabled = settings.profileRemindersEnabled;
    this.pinned = settings.profileRemindersPinned;
    this.scan();
    this.layout();
  }
  private scan() {
    const next = this.enabled ? profilePlayer() : null;
    const same =
      next &&
      this.profile &&
      next.panel === this.profile.panel &&
      next.heading === this.profile.heading &&
      next.key === this.profile.key &&
      next.accountHint === this.profile.accountHint;
    if (!same) {
      this.trigger?.remove();
      this.trigger = undefined;
      this.toggle = undefined;
      this.profile = next ?? undefined;
      this.activated = this.pinned && !!next;
      this.opened = false;
    }
    if (next && (!same || !this.trigger?.isConnected)) this.addTrigger(next);
    if (this.pinned && next) this.activated = true;
    this.editor.refresh();
    this.layout();
  }
  private addTrigger(profile: ProfilePlayer) {
    this.trigger?.remove();
    const host = el("span");
    host.id = "kosmore-profile-trigger";
    host.dataset.kosmoreProfile = "trigger";
    const shadow = host.attachShadow({ mode: "open" }),
      style = el("style");
    style.textContent =
      ":host{display:block;margin:0 0 -28px;grid-column:1 / -1}:host([hidden]){display:none}button{display:inline-flex;align-items:center;gap:5px;border:0;padding:3px 0;background:none;color:#dec17f;font:600 10px/1.5 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}button:hover{color:#fff0b5}button:focus-visible{outline:2px solid #f1ce81;outline-offset:4px;border-radius:3px}span{font-size:14px;line-height:1}";
    const toggle = button("", () => {
      if (this.pinned) {
        this.view?.host.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
        this.view?.host.shadowRoot
          ?.querySelector<HTMLTextAreaElement>("textarea")
          ?.focus({ preventScroll: true });
        return;
      }
      this.opened = !this.opened;
      this.activated = true;
      this.editor.refresh();
      this.layout();
      if (this.opened) this.pin.focus({ preventScroll: true });
    });
    const icon = el("span", "", "✦");
    icon.setAttribute("aria-hidden", "true");
    toggle.append(icon, document.createTextNode("KosMore"));
    toggle.setAttribute(
      "aria-label",
      `KosMore private reminders for ${profile.handle}`,
    );
    toggle.setAttribute("aria-haspopup", "dialog");
    toggle.setAttribute("aria-controls", "kosmore-profile-reminders");
    toggle.setAttribute("aria-expanded", String(this.opened || this.pinned));
    shadow.append(style, toggle);
    host.addEventListener("click", (event) => event.stopPropagation());
    profile.panel.before(host);
    this.trigger = host;
    this.toggle = toggle;
  }
  private layout() {
    if (this.trigger) this.trigger.hidden = this.pinned;
    this.toggle?.setAttribute(
      "aria-expanded",
      String(this.opened || this.pinned),
    );
    const host = this.view?.host,
      profile = this.profile;
    if (!host || !profile) return;
    if (host.matches(":popover-open") && (this.pinned || !this.opened))
      host.hidePopover();
    host.dataset.mode = this.pinned ? "widget" : "popup";
    this.pin.setAttribute(
      "aria-label",
      this.pinned ? "Unpin profile reminders" : "Pin reminders to profile",
    );
    this.pin.title = this.pinned
      ? "Unpin profile reminders"
      : "Pin on profile pages";
    this.pin.setAttribute("aria-pressed", String(this.pinned));
    this.pin.disabled = this.savingPin;
    this.close.hidden = this.pinned;
    if (this.pinned) {
      host.removeAttribute("popover");
      host.removeAttribute("role");
      host.removeAttribute("aria-label");
      host.style.removeProperty("left");
      host.style.removeProperty("top");
      host.hidden = false;
      if (profile.panel.nextElementSibling !== host) profile.panel.after(host);
    } else {
      host.popover = "manual";
      host.setAttribute("role", "dialog");
      host.setAttribute(
        "aria-label",
        `Private reminders for ${profile.handle}`,
      );
      host.hidden = !this.opened;
      if (!host.isConnected) document.body.append(host);
      if (this.opened) {
        if (!host.matches(":popover-open")) host.showPopover();
        this.position();
      }
    }
  }
  private position() {
    if (this.frame || !this.opened || this.pinned) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const host = this.view?.host,
        anchor = this.trigger;
      if (!host || !anchor?.isConnected || this.pinned || !this.opened) return;
      const rect = anchor.getBoundingClientRect();
      host.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - host.offsetWidth - 12))}px`;
      host.style.top = `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - host.offsetHeight - 12))}px`;
    });
  }
  private hidePopup(focus = true) {
    this.opened = false;
    this.layout();
    if (focus) this.toggle?.focus({ preventScroll: true });
  }
  private async setPinned(pinned: boolean) {
    if (this.savingPin) return;
    this.savingPin = true;
    this.pin.disabled = true;
    try {
      const settings = await readSettings();
      await chrome.storage.local.set({
        [SETTINGS_KEY]: { ...settings, profileRemindersPinned: pinned },
      });
      this.pinned = pinned;
      this.opened = !pinned;
      this.layout();
      this.pin.focus({ preventScroll: true });
    } catch (error) {
      this.view?.failed(error);
    } finally {
      this.savingPin = false;
      this.pin.disabled = false;
    }
  }
}
