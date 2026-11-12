import { ApiError, type GameClient } from "../kosmora/client";
import { resolveCard } from "../kosmora/dom";
import { foldFamilyName } from "../kosmora/families";
import {
  parseFusionCards,
  parseFusionRules,
  type FusionCard,
} from "../kosmora/fusion";
import { fusionVerdict } from "../shared/fusion-family";
import { isRelayMessage } from "../shared/page-relay";
import { setRequestPriority } from "../shared/request-scheduler";
import { finishOf } from "../shared/sale-observations";
import { settingMicros } from "../shared/sales-prices";
import type { CardFamily, Finish, Settings } from "../shared/types";
import { observePage } from "./page-changes";
import { el } from "./ui";

const MARK = "data-kosmore-fusion-next-batch";
const SLOT = ".fu-slots .fu-slot-on .fu-slot-btn";
const COPY = 'select[data-testid="fusion-copy"]';
const TRAY_CONTROLS =
  ".fu-grid .pick-hit, .fu-slot-btn, .fu-copy, .fu-tools > button";
const FILTER_CONTROLS = '.fu-recipe, [data-testid="fusion-filters"]';

interface FusionView {
  root: HTMLElement;
  grid: HTMLElement;
  clear: HTMLButtonElement;
  rarity: string;
}

interface Scan {
  view: FusionView;
  work: AbortController;
  slots: string[];
  added: number;
  unavailable: boolean;
  pending?: { slots: string[]; index: number };
}

function sameSlots(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function slotIds(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(SLOT)].map(
    (slot) =>
      resolveCard(slot.querySelector<HTMLElement>(".kc-article") ?? slot)
        ?.subjectId ?? "",
  );
}

function copyMenus(root: HTMLElement, ids: string[]) {
  return [...root.querySelectorAll<HTMLSelectElement>(COPY)].filter((select) =>
    ids.includes(select.value.toLowerCase()),
  );
}

function waitForNative(
  root: HTMLElement,
  signal: AbortSignal,
  ready: () => boolean,
) {
  signal.throwIfAborted();
  if (ready()) return Promise.resolve(true);
  return new Promise<boolean>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (ready()) finish(true);
    });
    const timeout = window.setTimeout(() => finish(false), 12_000);
    const aborted = () => finish(false, signal.reason);
    function finish(found: boolean, error?: unknown) {
      observer.disconnect();
      clearTimeout(timeout);
      signal.removeEventListener("abort", aborted);
      if (error) reject(error);
      else resolve(found);
    }
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    signal.addEventListener("abort", aborted, { once: true });
  });
}

function addLosses(losses: Map<string, number>, families: CardFamily[]) {
  for (const family of families)
    losses.set(family.id, (losses.get(family.id) ?? 0) + 1);
}

export class FusionNextBatch {
  private settings?: Settings;
  private cards = new Map<string, FusionCard>();
  private rules?: ReturnType<typeof parseFusionRules>;
  private scan?: Scan;
  private ownAction = false;
  private filterTimer?: number;
  private clear?: HTMLButtonElement;
  private button = el("button", "chip-btn");
  private star = el("span", "kosmore-star", "✦");
  private status = el("span", "fu-note");

  constructor(private client: GameClient) {
    this.button.type = "button";
    this.button.setAttribute(MARK, "");
    this.star.setAttribute("aria-hidden", "true");
    this.star.style.display = "inline-block";
    this.button.append(this.star, document.createTextNode(" Next Batch"));
    this.button.addEventListener("click", () => void this.fill());
    this.status.setAttribute(MARK, "");
    this.status.setAttribute("role", "status");
    this.status.hidden = true;
  }

  get running() {
    return !!this.scan;
  }

  start() {
    observePage(() => this.refresh());
    this.client.onAccountChange(() => this.reset());
    window.addEventListener("pagehide", () => this.reset());
    window.addEventListener("popstate", () => this.refresh());
    window.addEventListener("message", (event) => {
      if (
        location.pathname !== "/fusion" ||
        event.source !== window ||
        event.origin !== location.origin ||
        !isRelayMessage(event.data)
      )
        return;
      const { path, data, fusionQuery } = event.data;
      try {
        if (path === "/api/fusion") this.rules = parseFusionRules(data);
        if (path === "/api/fusion/cards") {
          const query = new URLSearchParams(
            typeof fusionQuery === "string" ? fusionQuery : "",
          );
          if (!query.has("cursor") && !query.has("ids")) {
            this.stop();
            this.cards.clear();
          }
          for (const card of parseFusionCards(data))
            this.cards.set(card.subjectId, card);
        }
      } catch {
        // Missing native data can be read on demand when Next Batch is clicked.
      }
    });
    for (const event of ["click", "input", "change"])
      document.addEventListener(
        event,
        (event) => this.nativeInput(event),
        true,
      );
  }

  setSettings(settings: Settings) {
    const previous = this.settings;
    this.settings = settings;
    if (
      previous &&
      (previous.fusionEnabled !== settings.fusionEnabled ||
        previous.fusionNextBatchEnabled !== settings.fusionNextBatchEnabled ||
        previous.fusionRespectFamilyImpact !==
          settings.fusionRespectFamilyImpact ||
        previous.fusionRespectBlacklist !== settings.fusionRespectBlacklist ||
        previous.fusionRespectPriceThreshold !==
          settings.fusionRespectPriceThreshold ||
        previous.fusionExcludeFullArts !== settings.fusionExcludeFullArts ||
        previous.fusionExcludeShiny !== settings.fusionExcludeShiny ||
        previous.fusionExcludeNumberOnes !== settings.fusionExcludeNumberOnes ||
        previous.fusionPriceThreshold !== settings.fusionPriceThreshold ||
        previous.familyBlacklist.join("\n") !==
          settings.familyBlacklist.join("\n"))
    )
      this.stop();
    this.refresh();
  }

  private view(): FusionView | undefined {
    if (location.pathname !== "/fusion") return;
    const root = document.querySelector<HTMLElement>(".fu-screen");
    const grid = root?.querySelector<HTMLElement>(".fu-grid");
    const clear = root?.querySelector<HTMLButtonElement>(
      ".fu-tools > button.chip-btn:last-of-type",
    );
    const recipe = root?.querySelector('.fu-recipe[aria-checked="true"]');
    const rarity = [...(recipe?.classList ?? [])]
      .find((name) => /^fu-r-[a-z]+$/.test(name))
      ?.slice(5);
    if (root && grid && clear && rarity) return { root, grid, clear, rarity };
  }

  private refresh() {
    const view = this.view();
    const scan = this.scan;
    if (
      scan &&
      (!view ||
        view.root !== scan.view.root ||
        view.grid !== scan.view.grid ||
        view.rarity !== scan.view.rarity ||
        (!scan.pending && !sameSlots(scan.slots, slotIds(view.root))))
    )
      this.stop();
    if (
      !view ||
      !this.settings?.fusionEnabled ||
      !this.settings.fusionNextBatchEnabled
    ) {
      this.button.remove();
      this.status.remove();
      this.showStatus("");
      this.clear = undefined;
      return;
    }
    if (
      this.clear !== view.clear ||
      this.button.nextElementSibling !== view.clear
    ) {
      this.clear = view.clear;
      view.clear.before(this.button);
      view.clear.after(this.status);
    }
    this.button.disabled =
      this.running ||
      this.filterTimer !== undefined ||
      view.grid.getAttribute("aria-busy") === "true";
  }

  private reset() {
    this.stop();
    clearTimeout(this.filterTimer);
    this.filterTimer = undefined;
    this.cards.clear();
    this.rules = undefined;
    this.showStatus("");
  }

  private showStatus(text: string) {
    this.status.hidden = !text;
    this.status.textContent = text;
  }

  private nativeInput(event: Event) {
    const scan = this.scan;
    if (this.ownAction || !(event.target instanceof Element)) return;
    const target = event.target;
    if (location.pathname !== "/fusion" || target.closest(`[${MARK}]`)) return;
    if (
      target.closest('[data-testid="fusion-filters"]') &&
      event.type === "input"
    ) {
      // Kosmora debounces its search field before marking the grid busy.
      clearTimeout(this.filterTimer);
      this.filterTimer = window.setTimeout(() => {
        this.filterTimer = undefined;
        this.refresh();
      }, 350);
      this.refresh();
    }
    if (scan?.pending && target.closest(".fu-bar button")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (
      target.closest(TRAY_CONTROLS) ||
      target.closest(FILTER_CONTROLS) ||
      target.closest(".fu-pick .center > button, .fu-bar button")
    ) {
      if (scan) this.stop();
      else this.showStatus("");
    }
  }

  private act(action: () => void) {
    this.ownAction = true;
    try {
      action();
    } finally {
      this.ownAction = false;
    }
  }

  private rollback(scan: Scan) {
    const { pending, view } = scan;
    const current = this.view();
    if (
      !pending ||
      current?.rarity !== view.rarity ||
      current.root !== view.root
    )
      return;
    if (sameSlots(pending.slots, slotIds(view.root))) {
      const slot =
        view.root.querySelectorAll<HTMLButtonElement>(SLOT)[pending.index];
      if (slot) this.act(() => slot.click());
    }
  }

  private stop() {
    const scan = this.scan;
    if (!scan || scan.work.signal.aborted) return;
    this.rollback(scan);
    scan.work.abort();
    this.showStatus(
      scan.added
        ? `Selection stopped. Added ${scan.added}.`
        : "Selection stopped.",
    );
  }

  private tiles(grid: HTMLElement) {
    return [...grid.querySelectorAll<HTMLButtonElement>(".pick-hit")].flatMap(
      (button) => {
        const article = button
          .closest(".pick")
          ?.querySelector<HTMLElement>(".kc-article");
        const card = article && resolveCard(article);
        return card ? [{ button, id: card.subjectId }] : [];
      },
    );
  }

  private async fill() {
    const view = this.view();
    const settings = this.settings;
    if (
      !view ||
      !settings?.fusionEnabled ||
      !settings.fusionNextBatchEnabled ||
      this.button.disabled
    )
      return;
    const scan: Scan = {
      view,
      work: new AbortController(),
      slots: slotIds(view.root),
      added: 0,
      unavailable: false,
    };
    this.scan = scan;
    const signal = setRequestPriority(scan.work.signal, "interactive");
    this.refresh();
    this.showStatus("Looking for eligible cards…");
    this.button.setAttribute("aria-busy", "true");
    let spin: Animation | undefined;
    try {
      if (window.matchMedia("(prefers-reduced-motion: no-preference)").matches)
        spin = this.star.animate(
          [{ transform: "rotate(0turn)" }, { transform: "rotate(1turn)" }],
          { duration: 1000, iterations: Infinity },
        );
      await this.client.account(signal);
      const rules = this.rules ?? (await this.client.fusionRules(signal));
      const rarity = [...rules.recipes.keys()].find(
        (rarity) => rarity.toLowerCase() === view.rarity,
      );
      if (!rarity || scan.slots.some((id) => !id))
        throw new Error("Fusion tray unavailable.");
      const cost = rules.recipes.get(rarity)!;
      const needed = cost * rules.maxBatches - scan.slots.length;
      if (needed <= 0) {
        this.showStatus("The Fusion tray is full.");
        return;
      }
      await this.scanGrid(scan, settings, rarity, needed, signal);
      signal.throwIfAborted();
      const remaining = needed - scan.added;
      this.showStatus(
        remaining
          ? `${scan.added ? `Added ${scan.added}. ` : "No eligible cards found. "}${remaining} ${remaining === 1 ? "slot remains" : "slots remain"}.${scan.unavailable ? " Some card data was unavailable." : ""}`
          : `Added ${scan.added}. The Fusion tray is full.`,
      );
    } catch (error) {
      if (!signal.aborted) {
        this.rollback(scan);
        const reason =
          error instanceof ApiError && error.status === 429
            ? "Kosmora is rate limiting requests. Try again shortly."
            : "Could not finish selecting cards. Try again.";
        this.showStatus(scan.added ? `Added ${scan.added}. ${reason}` : reason);
      }
    } finally {
      spin?.cancel();
      this.button.removeAttribute("aria-busy");
      this.scan = undefined;
      this.refresh();
    }
  }

  private async scanGrid(
    scan: Scan,
    settings: Settings,
    rarity: string,
    needed: number,
    signal: AbortSignal,
  ) {
    const { root, grid } = scan.view;
    const blacklist = new Set(
      settings.fusionRespectBlacklist
        ? settings.familyBlacklist.map(foldFamilyName)
        : [],
    );
    const price = settings.fusionRespectPriceThreshold
      ? settingMicros(settings.fusionPriceThreshold)
      : undefined;
    const filterCopy =
      price !== undefined ||
      settings.fusionExcludeFullArts ||
      settings.fusionExcludeShiny ||
      settings.fusionExcludeNumberOnes;
    const insights = new Map<string, ReturnType<GameClient["insights"]>>();
    const inspect = (id: string) => {
      let card = insights.get(id);
      if (!card) {
        card = this.client.insights(id, signal, true);
        insights.set(id, card);
      }
      return card;
    };
    const losses = new Map<string, number>();
    const picked = new Map<string, number>();
    for (const id of scan.slots) picked.set(id, (picked.get(id) ?? 0) + 1);
    let baselineKnown = true;
    if (settings.fusionRespectFamilyImpact) {
      for (const [id, selected] of picked) {
        const card = await this.tryCard(scan, signal, () => inspect(id));
        const quantity = Math.max(
          this.cards.get(id)?.quantity ?? 0,
          card?.copies.length ?? 0,
        );
        if (selected < quantity) continue;
        if (!card?.families || quantity !== selected) baselineKnown = false;
        else
          addLosses(
            losses,
            card.families.filter((family) => family.economic !== false),
          );
      }
    }
    let familyData:
      Promise<[Map<string, number>, number[]] | undefined> | undefined;
    const visited = new Set<string>();
    let emptyPages = 0;
    while (scan.added < needed) {
      signal.throwIfAborted();
      const tiles = this.tiles(grid).filter(({ id }) => !visited.has(id));
      emptyPages = tiles.length ? 0 : emptyPages + 1;
      if (emptyPages > 2) throw new Error("Fusion pages stopped advancing.");
      const missing = tiles.filter(
        ({ id }) => this.cards.get(id)?.usable === undefined,
      );
      for (let offset = 0; offset < missing.length; offset += 60) {
        const subjects = missing.slice(offset, offset + 60).map(({ id }) => id);
        const cards = await this.tryCard(scan, signal, () =>
          this.client.fusionCards(rarity, subjects, signal),
        );
        for (const card of cards ?? []) this.cards.set(card.subjectId, card);
      }
      for (const { button, id } of tiles) {
        signal.throwIfAborted();
        visited.add(id);
        const card = this.cards.get(id);
        let selected = picked.get(id) ?? 0;
        if (!card || card.usable === undefined) {
          scan.unavailable = true;
          continue;
        }
        if (
          button.disabled ||
          card.rarity !== rarity ||
          selected >= card.usable
        )
          continue;
        const canLeave =
          settings.fusionRespectFamilyImpact && card.usable >= card.quantity;
        const details =
          filterCopy || blacklist.size || canLeave
            ? await this.tryCard(scan, signal, () => inspect(id))
            : undefined;
        if (filterCopy && !details) continue;
        if (blacklist.size && !details?.families) continue;
        if (
          details?.families?.some((family) =>
            blacklist.has(foldFamilyName(family.name)),
          )
        )
          continue;
        const quantity = Math.max(card.quantity, details?.copies.length ?? 0);
        const economic = details?.families?.filter(
          (family) => family.economic !== false,
        );
        const copyPicker =
          card.usable > 1 || card.quantity > card.usable || card.numberOne;
        const native = copyPicker
          ? await this.tryCard(scan, signal, () =>
              this.client.fusionCopies(id, signal),
            )
          : undefined;
        const ids = native?.map((copy) => copy.id) ?? [];
        if (
          copyPicker &&
          (ids.length !== card.usable || new Set(ids).size !== ids.length)
        ) {
          scan.unavailable = true;
          continue;
        }
        if (
          selected &&
          !(await waitForNative(
            root,
            signal,
            () => copyMenus(root, ids).length === selected,
          ))
        ) {
          scan.unavailable = true;
          continue;
        }
        const allowed = new Map<Finish, boolean>();
        const tried = new Set<string>();
        while (selected < card.usable && scan.added < needed) {
          const leaves =
            settings.fusionRespectFamilyImpact && selected + 1 >= quantity;
          if (leaves && (!economic || (economic.length && !baselineKnown))) {
            scan.unavailable = true;
            break;
          }
          if (leaves && economic?.length) {
            familyData ??= this.tryCard(scan, signal, () =>
              Promise.all([
                this.client.familyCounts(signal, true),
                this.client.familyMilestones(signal),
              ]),
            );
            const data = await familyData;
            const verdict =
              data && fusionVerdict(economic, true, data[0], losses, data[1]);
            if (!verdict) scan.unavailable = true;
            if (!verdict?.safe) break;
          }
          const existing = copyMenus(root, ids).map((menu) =>
            menu.value.toLowerCase(),
          );
          const candidates = native ?? [
            {
              id: details?.copies[0]?.id.toLowerCase() ?? "",
              numberOne: !!card.numberOne,
            },
          ];
          const candidate = candidates.find(
            (copy) => !existing.includes(copy.id) && !tried.has(copy.id),
          );
          if (!candidate) break;
          tried.add(candidate.id);
          if (filterCopy) {
            const copy = details?.copies.find(
              (copy) => copy.id.toLowerCase() === candidate.id,
            );
            if (!copy || (!native && details?.copies.length !== 1)) {
              scan.unavailable = true;
              continue;
            }
            if (
              (settings.fusionExcludeFullArts && copy.variant.fullArt) ||
              (settings.fusionExcludeShiny && copy.variant.veil) ||
              (settings.fusionExcludeNumberOnes &&
                (candidate.numberOne || copy.numberOne || copy.serial === 1))
            )
              continue;
            if (price !== undefined) {
              const finish = finishOf(copy.variant);
              if (!allowed.has(finish)) {
                const history = await this.tryCard(scan, signal, () =>
                  this.client.history(id, finish, signal),
                );
                if (!history || (history.count > 0 && !history.sales.length))
                  scan.unavailable = true;
                allowed.set(
                  finish,
                  !!history &&
                    (history.count === 0 || history.sales.length > 0) &&
                    history.sales.every((sale) => BigInt(sale.price) <= price),
                );
              }
              if (!allowed.get(finish)) continue;
            }
          }
          await this.pick(
            scan,
            button,
            id,
            ids,
            existing,
            candidate.id,
            signal,
          );
          picked.set(id, ++selected);
          if (leaves && economic) addLosses(losses, economic);
        }
        if (scan.added >= needed) return;
      }
      const more = grid.parentElement?.querySelector<HTMLButtonElement>(
        ":scope > .center > button.btn-outline",
      );
      if (!more || more.disabled) return;
      this.act(() => more.click());
      if (
        !(await waitForNative(
          root,
          signal,
          () =>
            grid.getAttribute("aria-busy") !== "true" &&
            (!more.isConnected ||
              this.tiles(grid).some(({ id }) => !visited.has(id))),
        ))
      )
        throw new Error("Fusion page did not load.");
    }
  }

  private async tryCard<T>(
    scan: Scan,
    signal: AbortSignal,
    read: () => Promise<T>,
  ) {
    try {
      return await read();
    } catch (error) {
      signal.throwIfAborted();
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 429)
      )
        throw error;
      scan.unavailable = true;
    }
  }

  private async pick(
    scan: Scan,
    button: HTMLButtonElement,
    id: string,
    ids: string[],
    existing: string[],
    copy: string,
    signal: AbortSignal,
  ) {
    const { root } = scan.view;
    signal.throwIfAborted();
    if (
      !button.isConnected ||
      button.disabled ||
      !sameSlots(scan.slots, slotIds(root)) ||
      !sameSlots(
        existing,
        copyMenus(root, ids).map((menu) => menu.value.toLowerCase()),
      )
    )
      throw new Error("Fusion tray changed.");
    const index = scan.slots.includes(id)
      ? scan.slots.lastIndexOf(id) + 1
      : scan.slots.length;
    const expected = scan.slots.slice();
    expected.splice(index, 0, id);
    scan.pending = { slots: expected, index };
    this.act(() => button.click());
    if (
      !(await waitForNative(root, signal, () =>
        sameSlots(expected, slotIds(root)),
      ))
    )
      throw new Error("Fusion card was not selected.");
    if (ids.length > existing.length + 1) {
      const menus = () => copyMenus(root, ids);
      if (
        !(await waitForNative(
          root,
          signal,
          () => menus().length === existing.length + 1,
        ))
      )
        throw new Error("Fusion copy choices unavailable.");
      const menu = menus()[existing.length];
      let label: string | null | undefined;
      if (menu.value.toLowerCase() !== copy) {
        const option = [...menu.options].find(
          (option) => option.value.toLowerCase() === copy && !option.disabled,
        );
        if (!option) throw new Error("Fusion copy unavailable.");
        label = option.textContent;
        this.act(() => {
          menu.value = option.value;
          menu.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }
      if (
        !(await waitForNative(root, signal, () => {
          const current = menus();
          const caption = current[
            existing.length
          ]?.parentElement?.querySelector(":scope > span:not(.mk-sort-pre)");
          return (
            sameSlots(
              [...existing, copy],
              current.map((menu) => menu.value.toLowerCase()),
            ) &&
            (label == null || caption?.textContent === label)
          );
        }))
      )
        throw new Error("Fusion copy was not selected.");
    }
    signal.throwIfAborted();
    scan.slots = expected;
    scan.pending = undefined;
    scan.added++;
  }
}
