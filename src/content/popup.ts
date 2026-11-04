import css from "./popup.css?inline";
import {
  FINISHES,
  FINISH_LABEL,
  type Account,
  type Album,
  type CardContext,
  type CardInsights,
  type Finish,
  type KosmoraClient,
  type MarketHistory,
  type OwnedCopy,
  messageOf,
} from "../shared/types";
import { formatKosmo } from "../kosmora/contracts";
import { HOST_ID, topDialog } from "../kosmora/dom";
import { el, button, note } from "./ui";
type HistoryState = Partial<Record<Finish, MarketHistory | Error>>;
const COLORS: Record<Finish, string> = {
  plain: "#edcb82",
  veil: "#76dfcc",
  fullart: "#c3a0ff",
};
export class Popup {
  readonly host = el("div");
  readonly shadow = this.host.attachShadow({ mode: "open" });
  private metrics = el("div", "metrics");
  private market = el("section");
  private albumArea = el("section");
  private status = el("p", "album-status");
  private histories: HistoryState = {};
  private hidden = new Set<Finish>();
  private details?: CardInsights;
  private account?: Account;
  private albums?: Album[];
  private chosen?: OwnedCopy;
  private pinned: string[] = [];
  private copyProblem?: string;
  private pending = false;
  private closed = false;
  private reposition: ResizeObserver;
  constructor(
    readonly context: CardContext,
    private client: KosmoraClient,
    onRefresh: () => void,
    onClose: () => void,
    private openSettings: () => void,
  ) {
    this.host.id = HOST_ID;
    this.host.popover = "manual";
    this.host.setAttribute("role", "dialog");
    this.host.setAttribute("aria-label", `KosMore · ${context.name}`);
    const style = el("style");
    style.textContent = css;
    this.shadow.append(style);
    const top = el("header", "top"),
      brand = el("div", "brand", "✦ KosMore"),
      actions = el("div", "actions");
    actions.append(
      button("Refresh", onRefresh, "icon"),
      button("×", onClose, "icon"),
    );
    actions.lastElementChild!.setAttribute("aria-label", "Close KosMore popup");
    brand.append(actions);
    top.append(
      brand,
      el("h2", "", context.name),
      el(
        "p",
        "subtitle",
        `No. ${context.subjectId} · ${context.variant.fullArt ? "Full art" : context.variant.veil ? "Shiny" : "Standard"}`,
      ),
    );
    const body = el("div", "body");
    body.append(this.metrics, this.market, this.albumArea);
    const footer = el("footer", "footer");
    footer.append(
      el("span", "", "Kosmora card companion"),
      button("Settings", openSettings, "link"),
    );
    body.append(footer);
    this.shadow.append(top, body);
    this.metrics.setAttribute("aria-live", "polite");
    this.albumArea.setAttribute("aria-live", "polite");
    this.renderMetrics();
    this.renderMarket();
    this.albumArea.append(note("Loading your albums…"));
    (topDialog() ?? document.body).append(this.host);
    this.host.showPopover();
    for (const event of [
      "pointerdown",
      "pointerup",
      "click",
      "dblclick",
      "mousedown",
      "mouseup",
      "keydown",
      "keyup",
      "wheel",
    ])
      this.host.addEventListener(event, (e) => {
        e.stopPropagation();
      });
    this.host.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    });
    this.reposition = new ResizeObserver(() => this.position());
    this.reposition.observe(this.host);
    this.position();
  }
  dispose() {
    this.closed = true;
    this.reposition.disconnect();
    this.host.remove();
  }
  position() {
    if (this.closed) return;
    const r = this.context.anchor.getBoundingClientRect(),
      w = this.host.offsetWidth,
      h = this.host.offsetHeight;
    let left = r.right + 12;
    if (left + w > innerWidth - 12) left = r.left - w - 12;
    if (left < 12) left = Math.max(12, Math.min(r.left, innerWidth - w - 12));
    const top = Math.max(12, Math.min(r.top, innerHeight - h - 12));
    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
  }
  setInsights(details: CardInsights) {
    this.details = details;
    const sub = this.shadow.querySelector(".subtitle");
    if (sub)
      sub.textContent = `${details.rarity} · No. ${details.subjectId} · ${this.context.variant.fullArt ? "Full art" : this.context.variant.veil ? "Shiny" : "Standard"}`;
    this.renderMetrics();
    this.renderAlbums();
  }
  insightsFailed(error: unknown) {
    this.metrics.replaceChildren(note(messageOf(error), true));
  }
  setHistory(finish: Finish, result: MarketHistory | Error) {
    this.histories[finish] = result;
    this.renderMetrics();
    this.renderMarket();
  }
  setAlbums(
    account: Account,
    albums: Album[],
    pinned: string[],
    chosen?: OwnedCopy,
    problem?: string,
  ) {
    this.account = account;
    this.albums = albums;
    this.pinned = pinned;
    this.chosen = chosen;
    this.copyProblem = problem;
    this.renderAlbums();
  }
  albumsFailed(error: unknown) {
    this.albumArea.replaceChildren(
      this.heading("Pinned albums"),
      note(messageOf(error), true),
      button("Choose pinned albums", this.openSettings, "link"),
    );
  }
  private heading(text: string, aside?: string) {
    const h = el("div", "section-heading");
    h.append(el("h3", "", text));
    if (aside) h.append(el("span", "", aside));
    return h;
  }
  private renderMetrics() {
    const known = Object.values(this.histories).filter(
      (h): h is MarketHistory => !(h instanceof Error),
    );
    const all = known.length === 3;
    const values = [
      [
        "Kosmora interest",
        this.details?.interested == null
          ? "—"
          : this.details.interested.toLocaleString(),
      ],
      [
        "Wikipedia · recorded median/day",
        this.details?.readership == null
          ? "—"
          : this.details.readership.toLocaleString(),
      ],
      [
        "Sales · 30 days",
        known.length
          ? `${known.reduce((n, h) => n + h.count, 0).toLocaleString()}${all ? "" : "+"}`
          : "—",
      ],
    ];
    this.metrics.replaceChildren(
      ...values.map(([label, value]) => {
        const m = el("div", "metric");
        m.append(el("strong", "", value), el("span", "", label));
        return m;
      }),
    );
    this.metrics.children[0]?.setAttribute(
      "title",
      "Players interested in this card",
    );
    this.metrics.children[1]?.setAttribute(
      "title",
      `Kosmora’s recorded median daily Wikipedia views. ${this.details?.readershipSource ?? ""}`,
    );
    this.metrics.children[2]?.setAttribute(
      "title",
      all
        ? "Completed sales across the three market finish groups."
        : "Incomplete while one or more finish groups are unavailable.",
    );
  }
  private renderMarket() {
    this.market.replaceChildren(
      this.heading("Market history", "30-day window"),
    );
    const legend = el("div", "legend");
    for (const finish of FINISHES) {
      const label = el("label"),
        check = el("input");
      check.type = "checkbox";
      check.checked = !this.hidden.has(finish);
      check.style.accentColor = COLORS[finish];
      check.addEventListener("change", () => {
        if (check.checked) this.hidden.delete(finish);
        else this.hidden.add(finish);
        this.renderMarket();
      });
      label.append(check, document.createTextNode(FINISH_LABEL[finish]));
      legend.append(label);
    }
    this.market.append(legend);
    const available = FINISHES.filter((f) => !this.hidden.has(f)).flatMap(
      (f) => {
        const h = this.histories[f];
        return h && !(h instanceof Error) ? [h] : [];
      },
    );
    const sales = available
      .flatMap((h) => h.sales)
      .sort((a, b) => Date.parse(b.soldAt) - Date.parse(a.soldAt));
    if (sales.length) this.market.append(this.chart(available));
    const table = el("table", "stats");
    table.setAttribute("aria-label", "Market summaries by variant");
    const head = el("tr");
    for (const title of ["Variant", "Sales", "Min", "Median", "Max"])
      head.append(el("th", "", title));
    const thead = el("thead");
    thead.append(head);
    table.append(thead);
    const tbody = el("tbody");
    for (const f of FINISHES) {
      if (this.hidden.has(f)) continue;
      const state = this.histories[f],
        row = el("tr");
      row.append(el("td", "", FINISH_LABEL[f]));
      if (!state || state instanceof Error) {
        const td = el(
          "td",
          "",
          state instanceof Error ? "Unavailable" : "Loading…",
        );
        td.colSpan = 4;
        row.append(td);
      } else
        for (const value of [
          String(state.count),
          state.low ? formatKosmo(state.low) : "—",
          state.median ? formatKosmo(state.median) : "—",
          state.high ? formatKosmo(state.high) : "—",
        ])
          row.append(el("td", "", value));
      tbody.append(row);
    }
    table.append(tbody);
    this.market.append(table);
    for (const f of FINISHES) {
      const h = this.histories[f];
      if (h instanceof Error)
        this.market.append(note(`${FINISH_LABEL[f]}: ${h.message}`, true));
    }
    if (available.some((h) => !h.complete))
      this.market.append(
        note(
          "The chart uses the returned sales sample. Counts and price summaries cover the reported window.",
        ),
      );
    if (sales.length) {
      this.market.append(
        this.heading(
          "Recent sales",
          `Latest ${Math.min(10, sales.length)} available`,
        ),
      );
      const list = el("ol", "sales");
      for (const s of sales.slice(0, 10)) {
        const li = el("li"),
          time = el(
            "time",
            "",
            new Date(s.soldAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
          );
        time.dateTime = s.soldAt;
        time.title = new Date(s.soldAt).toLocaleString();
        li.append(
          time,
          el("span", "finish", FINISH_LABEL[s.finish]),
          el("b", "", formatKosmo(s.price)),
        );
        list.append(li);
      }
      this.market.append(list);
    } else if (available.length)
      this.market.append(
        note("No completed sales in the available variant histories."),
      );
    this.market.append(
      el("p", "summary-label", "Prices in Kosmo · completed sales only"),
    );
  }
  private chart(histories: MarketHistory[]) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 400 130");
    svg.classList.add("chart");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "Completed sale prices over the last 30 days, separated by variant",
    );
    const sales = histories.flatMap((h) => h.sales),
      values = sales.map((s) => BigInt(s.price));
    const low = values.reduce((a, b) => (a < b ? a : b)),
      high = values.reduce((a, b) => (a > b ? a : b)),
      range = high - low || 1n;
    const start = Date.now() - 30 * 86400000;
    for (const y of [20, 55, 90]) {
      const line = document.createElementNS(svg.namespaceURI, "line");
      for (const [k, v] of Object.entries({
        x1: 12,
        x2: 388,
        y1: y,
        y2: y,
        stroke: "#ffffff0c",
      }))
        line.setAttribute(k, String(v));
      svg.append(line);
    }
    for (const h of histories) {
      const points = [...h.sales]
        .sort((a, b) => Date.parse(a.soldAt) - Date.parse(b.soldAt))
        .map((s) => ({
          sale: s,
          x:
            12 +
            Math.max(
              0,
              Math.min(1, (Date.parse(s.soldAt) - start) / (30 * 86400000)),
            ) *
              376,
          y: 90 - Number(((BigInt(s.price) - low) * 70000n) / range) / 1000,
        }));
      const path = document.createElementNS(svg.namespaceURI, "polyline");
      path.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", COLORS[h.finish]);
      path.setAttribute("stroke-opacity", ".65");
      svg.append(path);
      for (const p of points) {
        const circle = document.createElementNS(svg.namespaceURI, "circle");
        circle.setAttribute("cx", String(p.x));
        circle.setAttribute("cy", String(p.y));
        circle.setAttribute("r", "3");
        circle.setAttribute("fill", COLORS[h.finish]);
        const title = document.createElementNS(svg.namespaceURI, "title");
        title.textContent = `${FINISH_LABEL[h.finish]} · ${formatKosmo(p.sale.price)} Kosmo · ${new Date(p.sale.soldAt).toLocaleString()}`;
        circle.append(title);
        svg.append(circle);
      }
    }
    for (const [x, text] of [
      [12, "30 days ago"],
      [340, "Today"],
    ] as const) {
      const t = document.createElementNS(svg.namespaceURI, "text");
      t.setAttribute("x", String(x));
      t.setAttribute("y", "118");
      t.setAttribute("fill", "#aa98bd");
      t.setAttribute("font-size", "10");
      t.textContent = text;
      svg.append(t);
    }
    return svg;
  }
  private renderAlbums() {
    if (!this.albums || !this.account) return;
    const area = this.albumArea;
    area.replaceChildren(this.heading("Pinned albums"));
    if (!this.pinned.length) {
      area.append(
        note("Pin the albums you use most for quick access."),
        button("Choose pinned albums", this.openSettings, "link"),
      );
      return;
    }
    const copies = this.details?.copies ?? [];
    if (this.copyProblem) area.append(note(this.copyProblem, true));
    if (!copies.length) {
      area.append(
        note(
          this.details
            ? "Own a copy of this card to add it to an album."
            : "Loading owned copies…",
        ),
      );
      return;
    }
    if (copies.length > 1 || this.copyProblem) {
      const label = el("label", "copy-label", "Choose an owned copy");
      const select = el("select");
      select.setAttribute("aria-label", "Owned copy");
      const blank = el("option", "", "Select a copy…");
      blank.value = "";
      select.append(blank);
      for (const c of copies) {
        const o = el(
          "option",
          "",
          `${c.variant.fullArt ? "Full art" : c.variant.veil ? "Shiny" : "Standard"}${c.serial ? ` #${c.serial}` : ""} · ${c.id.slice(0, 8)} · ${c.state}`,
        );
        o.value = c.id;
        select.append(o);
      }
      select.value = this.chosen?.id ?? "";
      select.addEventListener("change", () => {
        this.chosen = copies.find((c) => c.id === select.value);
        this.renderAlbums();
      });
      label.append(select);
      area.append(label);
    }
    const selected =
      this.chosen ??
      (!this.copyProblem && copies.length === 1 ? copies[0] : undefined);
    if (selected)
      area.append(
        el(
          "p",
          "note",
          `${selected.variant.fullArt ? "Full art" : selected.variant.veil ? "Shiny" : "Standard"} copy · ${selected.id.slice(0, 8)}`,
        ),
      );
    const grid = el("div", "albums");
    for (const id of this.pinned) {
      const album = this.albums.find((a) => a.id === id);
      const b = button(
        album?.name ?? "Album unavailable",
        () => void this.add(id, selected),
      );
      const why = !album
        ? "Unavailable"
        : album.contains
          ? "Already added"
          : album.items >= 2000
            ? "Album full"
            : !selected
              ? "Choose a copy"
              : undefined;
      if (why) b.append(el("small", "", why));
      b.disabled = !!why || this.pending;
      grid.append(b);
    }
    area.append(grid, this.status);
  }
  private async add(id: string, copy?: OwnedCopy) {
    if (!copy || !this.account || this.pending) return;
    this.pending = true;
    this.status.className = "album-status";
    this.status.textContent = "Adding to album…";
    this.renderAlbums();
    try {
      await this.client.add(id, copy, this.account.key);
      this.albums = await this.client.albums(this.context.subjectId);
      this.status.textContent = "Added to album.";
    } catch (error) {
      this.status.className = "album-status error";
      this.status.textContent = messageOf(error);
      try {
        this.albums = await this.client.albums(this.context.subjectId);
      } catch {
        /* Keep existing state; next attempt rechecks it. */
      }
    } finally {
      this.pending = false;
      if (!this.closed) this.renderAlbums();
    }
  }
}
