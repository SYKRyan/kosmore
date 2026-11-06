export const NAVIGATION = [
  { id: "home", label: "Home", path: "/home" },
  { id: "collection", label: "Collection", path: "/collection" },
  { id: "albums", label: "Albums", path: "/albums" },
  { id: "atlas", label: "Atlas", path: "/atlas" },
  { id: "social", label: "Social", path: "/social" },
  { id: "marketBuy", label: "Market", path: "/market" },
  {
    id: "marketAuctions",
    label: "My Auctions",
    path: "/market?tab=overview&view=auctions",
  },
  {
    id: "marketActivity",
    label: "My Activity",
    path: "/market?tab=overview&view=mine",
  },
  {
    id: "marketAlerts",
    label: "Alerts",
    path: "/market#kosmore-alerts",
  },
  { id: "talents", label: "Talents", path: "/talents" },
  { id: "packs", label: "Packs", path: "/packs" },
  { id: "fusion", label: "Fusion", path: "/fusion" },
  { id: "pulsar", label: "Pulsar", path: "/games" },
  { id: "odyssey", label: "Odyssey", path: "/odyssey" },
  { id: "profile", label: "My Profile", path: null },
] as const;
export type NavigationId = (typeof NAVIGATION)[number]["id"];
export interface Shortcut {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}
export type Hotkeys = Partial<Record<NavigationId, Shortcut>>;
export function shortcutFromEvent(event: KeyboardEvent): Shortcut | undefined {
  if (
    event.isComposing ||
    event.repeat ||
    event.getModifierState("AltGraph") ||
    !/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(event.code)
  )
    return;
  return {
    code: event.code,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}
export function shortcutKey(shortcut: Shortcut): string {
  return `${shortcut.ctrl}-${shortcut.alt}-${shortcut.shift}-${shortcut.meta}-${shortcut.code}`;
}
export function shortcutLabel(shortcut?: Shortcut): string {
  if (!shortcut) return "Not set";
  return [
    ...(shortcut.ctrl ? ["Ctrl"] : []),
    ...(shortcut.alt ? ["Alt"] : []),
    ...(shortcut.shift ? ["Shift"] : []),
    ...(shortcut.meta ? ["Meta"] : []),
    shortcut.code.replace(/^(Key|Digit)/, ""),
  ].join(" + ");
}
export function hotkeyConflict(hotkeys: Hotkeys): string | undefined {
  const used = new Map<string, string>();
  for (const item of NAVIGATION) {
    const shortcut = hotkeys[item.id];
    if (!shortcut) continue;
    const key = shortcutKey(shortcut),
      previous = used.get(key);
    if (previous)
      return `${previous} and ${item.label} both use ${shortcutLabel(shortcut)}. Choose a different shortcut or clear one.`;
    used.set(key, item.label);
  }
}
export function parseHotkeys(value: unknown): Hotkeys {
  const result: Hotkeys = {},
    used = new Set<string>();
  if (!value || typeof value !== "object") return result;
  const entries = value as Record<string, unknown>;
  for (const item of NAVIGATION) {
    const raw = entries[item.id];
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Partial<Shortcut>;
    if (
      typeof v.code !== "string" ||
      !/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(v.code) ||
      ![v.ctrl, v.alt, v.shift, v.meta].every(
        (flag) => typeof flag === "boolean",
      )
    )
      continue;
    const shortcut = {
      code: v.code,
      ctrl: v.ctrl!,
      alt: v.alt!,
      shift: v.shift!,
      meta: v.meta!,
    };
    const key = shortcutKey(shortcut);
    if (used.has(key)) continue;
    used.add(key);
    result[item.id] = shortcut;
  }
  return result;
}
export function isTyping(event: KeyboardEvent): boolean {
  return event
    .composedPath()
    .some(
      (target) =>
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.matches(
            "input, textarea, select, [role='textbox'], [role='combobox']",
          )),
    );
}
