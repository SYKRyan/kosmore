import {
  cardOverlayTargets,
  cardOverlaysAllowed,
  contextKey,
  resolveCard,
  topDialog,
  MARKET_ACTIVITY_LINK,
  MARKET_ACTIVITY_ROW,
} from "../kosmora/dom";
import type { CardContext, Settings } from "../shared/types";
import { affected, observePage, type PageChanges } from "./page-changes";
import { el } from "./ui";
import logo from "./kosmora-logo.svg?raw";

interface Entry {
  root: HTMLElement;
  context: CardContext;
  key: string;
  host: HTMLElement;
  mount: HTMLElement;
  button: HTMLButtonElement;
  visible: boolean;
}
interface Mount {
  count: number;
  position?: { value: string; priority: string };
}
const LOGO = `data:image/svg+xml,${encodeURIComponent(logo)}`;
const STYLE = `
:host{all:initial;position:absolute;display:block;width:44px;height:44px;z-index:30;transform:translate(-50%,-50%);pointer-events:none}
button{all:initial;box-sizing:border-box;display:grid;place-items:center;width:44px;height:44px;padding:4px;border-radius:50%;pointer-events:auto;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
button[hidden]{display:none}
img{display:block;box-sizing:border-box;width:36px;height:36px;background:#171027;border-radius:50%;box-shadow:0 2px 6px #0009;pointer-events:none}
button:hover img{filter:brightness(1.15)}
button:focus-visible{outline:2px solid #f3dda8;outline-offset:1px}
`;

/** Local absolute anchors scroll with their cards, without scroll-event positioning. */
export class TooltipButtons {
  private entries = new Map<HTMLElement, Entry>();
  private hosts = new WeakMap<Element, Entry>();
  private mounts = new Map<HTMLElement, Mount>();
  private settings?: Settings;
  private frame = 0;
  private intersection: IntersectionObserver;
  private resize: ResizeObserver;
  constructor(private open: (context: CardContext) => void) {
    this.intersection = new IntersectionObserver((records) => {
      for (const record of records) {
        const entry = this.hosts.get(record.target);
        if (entry) {
          entry.visible = record.isIntersecting;
          this.visibility(entry);
        }
      }
    });
    this.resize = new ResizeObserver(() => this.schedule());
  }
  start() {
    observePage((changes) => this.scan(changes));
    window.addEventListener("resize", () => this.scan());
    window.addEventListener("popstate", () => this.scan());
  }
  setSettings(settings: Settings) {
    this.settings = settings;
    this.scan();
  }
  contains(target: Element) {
    return !!target.closest("[data-kosmore-tooltip-buttons]");
  }
  focus(context: CardContext) {
    const entry = this.entryFor(context);
    if (entry && !entry.button.hidden)
      entry.button.focus({ preventScroll: true });
  }
  showing(context: CardContext) {
    const entry = this.entryFor(context);
    return !!entry?.host.isConnected && entry.visible && !entry.button.hidden;
  }
  private entryFor(context: CardContext) {
    return [...this.entries.values()].find(
      (entry) =>
        entry.context.anchor === context.anchor &&
        entry.key === contextKey(context),
    );
  }
  private enabled() {
    return (
      this.settings?.enabled && this.settings.useOverlayButtonInsteadOfHover
    );
  }
  private contextOf(root: HTMLElement) {
    if (location.pathname === "/market" && root.matches(MARKET_ACTIVITY_ROW)) {
      const link = root.querySelector<HTMLAnchorElement>(MARKET_ACTIVITY_LINK);
      return link ? resolveCard(link) : null;
    }
    if (root.matches(".bsell-row")) {
      const head = root.querySelector<HTMLElement>(".bsell-head");
      return location.pathname === "/market/sell/batch" && head
        ? resolveCard(head)
        : null;
    }
    return cardOverlaysAllowed(root) ? resolveCard(root) : null;
  }
  private targets(scope: Document | Element) {
    const targets = cardOverlayTargets(document, scope);
    if (location.pathname === "/market") {
      const enclosing =
        scope instanceof Element
          ? scope.closest<HTMLElement>(MARKET_ACTIVITY_ROW)
          : null;
      for (const row of [
        ...(enclosing ? [enclosing] : []),
        ...scope.querySelectorAll<HTMLElement>(MARKET_ACTIVITY_ROW),
      ]) {
        const context = this.contextOf(row);
        if (context) targets.set(row, context);
      }
    }
    if (location.pathname === "/market/sell/batch") {
      const enclosing =
        scope instanceof Element
          ? scope.closest<HTMLElement>(".bsell-row")
          : null;
      for (const row of [
        ...(enclosing ? [enclosing] : []),
        ...scope.querySelectorAll<HTMLElement>(".bsell-row"),
      ]) {
        const context = this.contextOf(row);
        if (context) targets.set(row, context);
      }
    }
    return targets;
  }
  private scan(changes?: PageChanges) {
    if (!this.enabled()) {
      for (const entry of this.entries.values()) this.remove(entry);
      this.entries.clear();
      return;
    }
    for (const [root, entry] of this.entries) {
      if (changes && !affected(root, changes)) continue;
      const context = root.isConnected ? this.contextOf(root) : null;
      if (
        !context ||
        contextKey(context) !== entry.key ||
        this.mountFor(root) !== entry.mount
      ) {
        this.remove(entry);
        this.entries.delete(root);
      } else {
        entry.context = context;
        if (!entry.host.isConnected) entry.mount.append(entry.host);
      }
    }
    for (const scope of !changes || changes.full ? [document] : changes.roots)
      for (const [root, context] of this.targets(scope)) {
        if (this.entries.has(root)) continue;
        const host = el("span"),
          button = el("button"),
          img = el("img"),
          style = el("style");
        host.setAttribute("data-kosmore-tooltip-buttons", "");
        style.textContent = STYLE;
        button.type = "button";
        button.setAttribute(
          "aria-label",
          `Open card tooltip for ${context.name}`,
        );
        button.setAttribute("aria-haspopup", "dialog");
        img.src = LOGO;
        img.alt = "";
        button.append(img);
        host.attachShadow({ mode: "open" }).append(style, button);
        const mount = this.mountFor(root);
        if (!mount) continue;
        this.retainMount(mount);
        const entry: Entry = {
          root,
          context,
          key: contextKey(context),
          host,
          mount,
          button,
          visible: true,
        };
        for (const type of [
          "pointerdown",
          "pointerup",
          "mousedown",
          "mouseup",
          "dblclick",
          "auxclick",
        ])
          button.addEventListener(type, (event) => event.stopPropagation());
        for (const type of ["keydown", "keyup"])
          button.addEventListener(type, (event) => {
            if (["Enter", " "].includes((event as KeyboardEvent).key))
              event.stopPropagation();
          });
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const next = this.contextOf(root);
          if (
            this.enabled() &&
            next &&
            contextKey(next) === entry.key &&
            !button.hidden
          )
            this.open(next);
        });
        this.entries.set(root, entry);
        this.hosts.set(host, entry);
        mount.append(host);
        this.intersection.observe(host);
        this.resize.observe(root);
      }
    this.layout();
  }
  private mountFor(root: HTMLElement): HTMLElement | null {
    // Stay outside native links/buttons, but inside the same scrolling content.
    let interactive: HTMLElement | undefined;
    for (
      let parent: HTMLElement | null = root;
      parent;
      parent = parent.parentElement
    )
      if (parent.matches('a[href],button,[role="button"]'))
        interactive = parent;
    let mount = interactive ? interactive.parentElement : root;
    if (!interactive && /(hidden|clip)/.test(getComputedStyle(root).overflow))
      mount = root.parentElement;
    while (mount && getComputedStyle(mount).display === "contents")
      mount = mount.parentElement;
    return mount;
  }
  private retainMount(mount: HTMLElement) {
    let state = this.mounts.get(mount);
    if (state) {
      state.count++;
      return;
    }
    state = { count: 1 };
    if (getComputedStyle(mount).position === "static") {
      state.position = {
        value: mount.style.getPropertyValue("position"),
        priority: mount.style.getPropertyPriority("position"),
      };
      mount.style.setProperty("position", "relative");
    }
    this.mounts.set(mount, state);
    this.resize.observe(mount);
  }
  private remove(entry: Entry) {
    this.intersection.unobserve(entry.host);
    this.resize.unobserve(entry.root);
    entry.host.remove();
    const state = this.mounts.get(entry.mount)!;
    if (--state.count) return;
    this.mounts.delete(entry.mount);
    this.resize.unobserve(entry.mount);
    // Existing card overlays may have adopted this same positioning anchor.
    if (
      state.position &&
      entry.mount.style.getPropertyValue("position") === "relative" &&
      !entry.mount.style.getPropertyPriority("position") &&
      !entry.mount.querySelector(
        ":scope > [data-kosmore-card-overlays],:scope > [data-kosmore-fusion-family]",
      )
    ) {
      if (state.position.value)
        entry.mount.style.setProperty(
          "position",
          state.position.value,
          state.position.priority,
        );
      else entry.mount.style.removeProperty("position");
    }
  }
  private schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.layout();
    });
  }
  private visibility(entry: Entry) {
    const dialog = topDialog();
    entry.button.hidden =
      !entry.visible || (!!dialog && !dialog.contains(entry.root));
  }
  private layout() {
    if (!this.enabled()) return;
    for (const entry of this.entries.values()) {
      const { root, mount, host } = entry;
      if (!root.isConnected) continue;
      let left = 8 - mount.clientLeft,
        top = root.offsetHeight - mount.clientTop - 8;
      if (root !== mount) {
        const rect = root.getBoundingClientRect(),
          bounds = mount.getBoundingClientRect();
        const scaleX = bounds.width / mount.offsetWidth || 1,
          scaleY = bounds.height / mount.offsetHeight || 1;
        left =
          (rect.left - bounds.left) / scaleX -
          mount.clientLeft +
          mount.scrollLeft +
          8;
        top =
          (rect.bottom - bounds.top) / scaleY -
          mount.clientTop +
          mount.scrollTop -
          8;
      }
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
      this.visibility(entry);
    }
  }
}
