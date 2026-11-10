import css from "./trade-interest.css?inline";
import { tradeSurface } from "../kosmora/trading";
import { matchFamily } from "../kosmora/families";
import { RARITIES, type InterestCounts } from "../kosmora/trade-interest";
import {
  friendReminderKey,
  readFriendReminder,
} from "../shared/friend-reminders";
import {
  defaults,
  parseSettings,
  readSettings,
  SETTINGS_KEY,
} from "../shared/settings";
import { messageOf, type KosmoraClient } from "../shared/types";
import { observePage } from "./page-changes";
import { button, el } from "./ui";
import { raritySymbol } from "./rarity-symbol";
import { TradeNotes } from "./trade-notes";

type Surface = NonNullable<ReturnType<typeof tradeSurface>>;
interface Active {
  surface: Surface;
  abort: AbortController;
  badges: HTMLDivElement;
  summary: HTMLDivElement;
  content: HTMLDivElement;
  storageKey?: string;
  families?: string[];
  counting: boolean;
  counted: boolean;
  countedAt?: number;
  visible?: boolean;
  countRequest?: AbortController;
  fresh: boolean;
  notes?: TradeNotes;
}
function host(kind: string) {
  const host = el("div");
  host.dataset.kosmoreTrade = kind;
  host.hidden = true;
  const shadow = host.attachShadow({ mode: "open" }),
    style = el("style");
  style.textContent = css;
  const content = el("div", kind);
  shadow.append(style, content);
  return { host, content };
}

export class TradeInterest {
  private active?: Active;
  private settings = defaults();
  private ready = false;
  private visibility = new IntersectionObserver((records) => {
    const active = this.active;
    if (!active) return;
    for (const record of records) {
      if (record.target !== active.summary) continue;
      active.visible = record.isIntersecting;
      if (!active.visible) active.countRequest?.abort();
    }
    this.maybeCount(active);
  });

  private maybeCount(active: Active) {
    if (
      active.visible &&
      !document.hidden &&
      active.surface.filters &&
      this.settings.showTradePossibleInterest &&
      active.families?.length &&
      !active.counting &&
      !active.counted
    )
      void this.count(active);
  }
  constructor(
    private client: Pick<
      KosmoraClient,
      "account" | "families" | "possibleInterest"
    >,
  ) {}
  start() {
    observePage(() => {
      if (
        this.active ||
        (this.settings.tradeRemindersEnabled &&
          location.pathname === "/trades/new")
      )
        this.scan();
    });
    window.addEventListener("popstate", () => this.scan());
    const resume = () => {
      if (document.hidden) {
        this.active?.countRequest?.abort();
        return;
      }
      const active = this.active;
      if (active?.countedAt && Date.now() - active.countedAt >= 30_000)
        this.refresh();
      else this.scan();
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[SETTINGS_KEY]) {
        this.settings = parseSettings(changes[SETTINGS_KEY].newValue);
        this.ready = true;
        this.refresh();
      } else if (this.active?.storageKey && changes[this.active.storageKey])
        this.refresh();
    });
    void readSettings()
      .catch(() => defaults())
      .then((settings) => {
        if (!this.ready) this.settings = settings;
        this.ready = true;
        this.scan();
      });
  }
  refresh(fresh = false) {
    this.clear();
    this.scan(fresh);
  }
  private clear() {
    if (this.active) this.visibility.unobserve(this.active.summary);
    this.active?.countRequest?.abort();
    this.active?.notes?.dispose();
    this.active?.abort.abort();
    this.active?.badges.remove();
    this.active?.summary.remove();
    this.active = undefined;
  }
  private scan(fresh = false) {
    const surface =
      this.ready && this.settings.tradeRemindersEnabled ? tradeSurface() : null;
    if (!surface) {
      this.clear();
      return;
    }
    let active = this.active;
    if (
      !active ||
      active.surface.screen !== surface.screen ||
      active.surface.steps !== surface.steps ||
      active.surface.key !== surface.key
    ) {
      this.clear();
      const badges = host("families"),
        summary = host("interest");
      summary.content.setAttribute("role", "status");
      active = {
        surface,
        abort: new AbortController(),
        badges: badges.host,
        summary: summary.host,
        content: summary.content,
        counting: false,
        counted: false,
        fresh,
      };
      this.active = active;
      this.visibility.observe(active.summary);
      this.renderLoading(active);
      void this.load(active, badges.content);
    }
    active.surface = surface;
    if (surface.filters) {
      if (this.settings.showTradePossibleInterest) {
        if (surface.filters.previousElementSibling !== active.summary)
          surface.filters.before(active.summary);
        this.maybeCount(active);
      } else active.summary.remove();
      const anchor = this.settings.showTradePossibleInterest
        ? active.summary
        : surface.filters;
      if (anchor.previousElementSibling !== active.badges)
        anchor.before(active.badges);
    } else {
      active.summary.remove();
      if (surface.steps.nextElementSibling !== active.badges)
        surface.steps.after(active.badges);
    }
  }
  private async load(active: Active, badges: HTMLElement) {
    try {
      const account = await this.client.account(active.abort.signal, false);
      if (this.active !== active) return;
      active.storageKey = friendReminderKey(account.key, active.surface.key);
      const reminder = await readFriendReminder(active.storageKey);
      if (this.active !== active) return;
      active.families = reminder.families;
      if (!reminder.families.length) {
        active.summary.hidden = true;
        active.content.setAttribute("aria-busy", "false");
      }
      badges.setAttribute(
        "aria-label",
        `Saved families for ${active.surface.handle}`,
      );
      badges.replaceChildren(
        ...(this.settings.showTradeFamilyBadges ? reminder.families : []).map(
          (family) => el("span", "family-badge", family),
        ),
      );
      if (this.settings.showTradeNotes && reminder.notes.trim()) {
        active.notes = new TradeNotes(
          reminder.notes,
          this.settings,
          active.surface.handle,
        );
        badges.append(active.notes.badge, active.notes.inline);
      }
      active.badges.hidden = !badges.childElementCount;
      this.scan();
    } catch {
      /* Private preferences remain hidden if the account or storage cannot be verified. */
      if (this.active === active) active.summary.hidden = true;
    }
  }
  private renderLoading(active: Active) {
    const label = el("span", "label", "Possible Interest:");
    const spinner = el("span", "spinner");
    spinner.setAttribute("aria-hidden", "true");
    label.append(spinner);
    const breakdown = el("div", "breakdown");
    const reservation = el("div", "breakdown-reservation");
    reservation.setAttribute("aria-hidden", "true");
    // Reserve the wrapping space for all six rarities before the counts arrive.
    reservation.append(
      ...RARITIES.map((rarity) => {
        const slot = el("span", "rarity-slot");
        slot.append(
          this.settings.tradeRaritySymbols
            ? el("span", "symbol-space")
            : el("span", "", rarity),
          el("span", "", "× 00,000"),
        );
        return slot;
      }),
    );
    breakdown.append(reservation, el("div", "breakdown-values"));
    active.content.replaceChildren(label, breakdown);
    active.content.classList.add("loading");
    active.content.setAttribute("aria-busy", "true");
    active.content.setAttribute("aria-label", "Calculating possible interest");
    active.content.title = "Calculating possible interest…";
    active.summary.hidden = false;
  }
  private async count(active: Active) {
    const controller = new AbortController();
    active.countRequest = controller;
    active.counting = true;
    this.renderLoading(active);
    try {
      const choices = await this.client.families(controller.signal);
      const ids = active.families!.map((name) => {
        const family = matchFamily(choices, name);
        if (!family)
          throw new Error(
            `Saved family “${name}” is no longer in Kosmora's family list.`,
          );
        return family.id;
      });
      const counts = await this.client.possibleInterest(
        ids,
        controller.signal,
        active.fresh,
      );
      if (this.active !== active || controller.signal.aborted) return;
      active.countedAt = Date.now();
      this.renderCounts(active, counts);
    } catch (error) {
      if (this.active !== active || controller.signal.aborted) return;
      active.content.classList.remove("loading");
      active.content.setAttribute("aria-busy", "false");
      active.content.removeAttribute("aria-label");
      active.content.replaceChildren(
        el("span", "error", "Possible Interest unavailable."),
        button("Retry", () => {
          active.counted = false;
          active.fresh = true;
          void this.count(active);
        }),
      );
      active.content.title = messageOf(error);
      active.summary.hidden = false;
    } finally {
      active.counting = false;
      active.countRequest = undefined;
      active.counted = !controller.signal.aborted;
      if (controller.signal.aborted && this.active === active)
        this.maybeCount(active);
    }
  }
  private renderCounts(active: Active, counts: InterestCounts) {
    const entries = RARITIES.filter((rarity) => counts[rarity] > 0);
    active.content.classList.remove("loading");
    active.content.setAttribute("aria-busy", "false");
    active.content.removeAttribute("aria-label");
    active.content.title =
      "Your available copies matching any saved family, including shiny and full art copies. Locked copies and cards for sale are excluded. Each copy is counted once.";
    active.content.querySelector(".breakdown-values")!.replaceChildren(
      ...entries.map((rarity) => {
        const item = el("span", "rarity-count");
        item.dataset.rarity = rarity;
        item.title = `${rarity} × ${counts[rarity].toLocaleString("en-US")}`;
        item.setAttribute("aria-label", item.title);
        item.append(
          this.settings.tradeRaritySymbols
            ? raritySymbol(rarity)
            : el("span", "", rarity),
          el("span", "", `× ${counts[rarity].toLocaleString("en-US")}`),
        );
        return item;
      }),
    );
    active.summary.hidden = !entries.length;
  }
}
