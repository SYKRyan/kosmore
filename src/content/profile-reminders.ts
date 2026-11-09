import { profilePlayer, type ProfilePlayer } from "../kosmora/profile";
import { selectedSocialFriend, FRIEND_REMINDERS_ID } from "../kosmora/social";
import { readSettings, parseSettings, SETTINGS_KEY } from "../shared/settings";
import type { KosmoraClient } from "../shared/types";
import { observePage } from "./page-changes";
import { SocialReminders } from "./social";
import type { FriendReminders } from "./friend-reminders";
import { button, el } from "./ui";
import { headerIcon } from "./icons";
import labelCss from "./kosmore-label.css?inline";

export class ProfileReminders {
  private profile?: ProfilePlayer & { anchor: HTMLElement };
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
  private close = button("", () => this.hidePopup(), "profile-close");
  private editor: SocialReminders;

  constructor(
    client: Pick<KosmoraClient, "account" | "families">,
    private kind: "profile" | "social" = "profile",
  ) {
    // An SVG pushpin stays legible beside the small brand label.
    this.pin.innerHTML =
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-4 1-4 4v4l-2 2-3-5-5-3 2-2h4l4-4 1-4Z M8 16l-5 5"/></svg>';
    this.close.setAttribute("aria-label", `Close ${this.kind} reminders`);
    this.close.append(headerIcon("close"));
    this.editor = new SocialReminders(client, {
      select: () =>
        this.enabled && this.activated ? (this.profile ?? null) : null,
      options: {
        profile: true,
        controls: [this.pin, this.close],
        id: this.editorId,
      },
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
  private get editorId() {
    return this.kind === "social"
      ? FRIEND_REMINDERS_ID
      : "kosmore-profile-reminders";
  }
  private get pinSetting() {
    return this.kind === "social"
      ? "socialRemindersPinned"
      : "profileRemindersPinned";
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
    this.enabled =
      settings.socialRemindersMasterEnabled &&
      (this.kind === "social"
        ? settings.socialRemindersEnabled
        : settings.profileRemindersEnabled);
    this.pinned = settings[this.pinSetting];
    this.scan();
    this.layout();
  }
  private scan() {
    const player =
      this.enabled && this.kind === "profile" ? profilePlayer() : null;
    const friend =
      this.enabled && this.kind === "social" ? selectedSocialFriend() : null;
    const links = friend?.panel.querySelector<HTMLElement>(".sb-links");
    const next = player
      ? { ...player, anchor: player.panel }
      : friend && links
        ? {
            ...friend,
            heading:
              friend.panel.querySelector<HTMLElement>(".sb-card-name") ??
              friend.panel,
            anchor: links,
          }
        : null;
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
    this.profile = next ?? undefined;
    if (next && (!same || !this.trigger?.isConnected)) this.addTrigger(next);
    if (this.pinned && next) this.activated = true;
    this.editor.refresh();
    this.layout();
  }
  private addTrigger(profile: ProfilePlayer & { anchor: HTMLElement }) {
    this.trigger?.remove();
    const host = el("span");
    host.id = `kosmore-${this.kind}-trigger`;
    host.dataset.kosmoreProfile = "trigger";
    const shadow = host.attachShadow({ mode: "open" }),
      style = el("style");
    style.textContent =
      labelCss +
      ":host{display:block;margin:0;grid-column:1 / -1}:host([hidden]){display:none}button{border:0;background:none;cursor:pointer}button:hover{color:#fff0b5}button:focus-visible{outline:2px solid #f1ce81;outline-offset:4px;border-radius:3px}";
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
    toggle.classList.add("kosmore-label");
    const icon = el("span", "kosmore-star", "✦");
    icon.setAttribute("aria-hidden", "true");
    toggle.append(icon, document.createTextNode("KosMore"));
    toggle.setAttribute(
      "aria-label",
      `KosMore private reminders for ${profile.handle}`,
    );
    toggle.setAttribute("aria-haspopup", "dialog");
    toggle.setAttribute("aria-controls", this.editorId);
    toggle.setAttribute("aria-expanded", String(this.opened || this.pinned));
    shadow.append(style, toggle);
    host.addEventListener("click", (event) => event.stopPropagation());
    profile.anchor.after(host);
    this.trigger = host;
    this.toggle = toggle;
  }
  private layout() {
    if (
      this.trigger &&
      this.profile?.anchor.isConnected &&
      this.profile.anchor.nextElementSibling !== this.trigger
    )
      this.profile.anchor.after(this.trigger);
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
      this.pinned
        ? `Unpin ${this.kind} reminders`
        : `Pin reminders to ${this.kind === "social" ? "Social" : "profile"}`,
    );
    this.pin.title = this.pin.getAttribute("aria-label")!;
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
      const anchor = this.trigger ?? profile.anchor;
      if (anchor.nextElementSibling !== host) anchor.after(host);
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
        [SETTINGS_KEY]: { ...settings, [this.pinSetting]: pinned },
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
