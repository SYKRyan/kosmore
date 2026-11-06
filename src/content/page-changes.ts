import { HOST_ID, FRIEND_TOOLTIP_ID, OVERLAY_ATTR } from "../kosmora/dom";
import { FRIEND_REMINDERS_ID } from "../kosmora/social";

const OWN_UI = `#${HOST_ID},#${FRIEND_TOOLTIP_ID},#${FRIEND_REMINDERS_ID},[${OVERLAY_ATTR}],[data-kosmore-sales-overlay],[data-kosmore-profile],[data-kosmore-fusion-family]`;
export interface PageChanges {
  roots: Element[];
  full: boolean;
}
const listeners = new Set<(changes: PageChanges) => void>();
let observer: MutationObserver | undefined;
let frame = 0;
let previousUrl = "";
const dirty = new Set<Element>();

function own(node: Node) {
  return node instanceof Element && node.matches(OWN_UI);
}
/** One observer and one frame callback for the extension's page features. */
export function observePage(listener: (changes: PageChanges) => void) {
  listeners.add(listener);
  if (!observer) {
    previousUrl = location.href;
    observer = new MutationObserver((records) => {
      for (const record of records) {
        const target =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        if (!target || target.closest(OWN_UI)) continue;
        const nodes = [...record.addedNodes, ...record.removedNodes];
        // Our own overlay insertion/removal must not schedule another page scan.
        // An externally removed host still needs to be restored.
        if (
          record.type === "childList" &&
          nodes.length &&
          nodes.every(own) &&
          !record.removedNodes.length
        )
          continue;
        const added = [...record.addedNodes].filter(
          (node): node is Element => node instanceof Element && !own(node),
        );
        if (
          record.type === "childList" &&
          added.length &&
          !target.closest(".kc-article,.ko-summary,.ko-card,.ko-viewer-sheet")
        ) {
          for (const node of added) dirty.add(node);
        } else dirty.add(target);
      }
      if (!dirty.size || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const roots = [...dirty].filter((root) => root.isConnected);
        dirty.clear();
        const changes = {
          roots: roots.filter(
            (root) =>
              !roots.some((other) => other !== root && other.contains(root)),
          ),
          full: location.href !== previousUrl,
        };
        previousUrl = location.href;
        for (const notify of listeners) notify(changes);
      });
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "class",
        "href",
        "src",
        "hidden",
        "aria-hidden",
        "aria-label",
        "inert",
        "style",
        "open",
        "disabled",
        "readonly",
        "aria-readonly",
        "data-ended",
      ],
    });
  }
  return () => listeners.delete(listener);
}

export function affected(root: Element, changes: PageChanges) {
  return (
    changes.full ||
    !root.isConnected ||
    changes.roots.some(
      (changed) => changed.contains(root) || root.contains(changed),
    )
  );
}
