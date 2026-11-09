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
  { id: "history", label: "History", path: "/history" },
  { id: "fusion", label: "Fusion", path: "/fusion" },
  { id: "pulsar", label: "Pulsar", path: "/games" },
  { id: "odyssey", label: "Odyssey", path: "/odyssey" },
  { id: "profile", label: "My Profile", path: null },
] as const;
export type NavigationId = (typeof NAVIGATION)[number]["id"];
export const PACK_OPENING = [
  { id: "focusFirstCard", label: "Focus First Card" },
  { id: "focusLastCard", label: "Focus Last Card" },
  { id: "nextCard", label: "Next Card" },
  { id: "previousCard", label: "Previous Card" },
  { id: "skipOpening", label: "Skip Opening" },
  { id: "later", label: "Later" },
  { id: "nextPack", label: "Next Pack/Back to Packs" },
  { id: "dismissFoundPack", label: "Dismiss Found Pack" },
  { id: "seeCard", label: "See Card" },
  { id: "share", label: "Share" },
  { id: "home", label: "Home" },
] as const;
export type PackOpeningId = (typeof PACK_OPENING)[number]["id"];
export interface Shortcut {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}
export type Hotkeys<Id extends string = NavigationId> = Partial<
  Record<Id, Shortcut>
>;
export type PinnedAlbumHotkeys = Record<string, Hotkeys<string>>;
export type ShortcutAction<Id extends string> = { id: Id; label: string };
export function validShortcutCode(code: unknown, pack = false): code is string {
  return (
    typeof code === "string" &&
    (/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(code) ||
      (pack && /^(Arrow(?:Up|Down|Left|Right)|Home|End)$/.test(code)))
  );
}
export function shortcutFromEvent(
  event: KeyboardEvent,
  pack = false,
): Shortcut | undefined {
  if (
    event.isComposing ||
    event.repeat ||
    event.getModifierState("AltGraph") ||
    !validShortcutCode(event.code, pack)
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
    shortcut.code.replace(/^(Key|Digit)/, "").replace(/^Arrow/, "Arrow "),
  ].join(" + ");
}
export function hotkeyConflict(
  hotkeys: Hotkeys,
  packHotkeys: Hotkeys<PackOpeningId> = {},
  albumHotkeys: PinnedAlbumHotkeys = {},
  albumNames?: ReadonlyMap<string, string>,
): string | undefined {
  const used = new Map<string, string>();
  const entries = [
    ...NAVIGATION.map(({ id, label }) => ({ label, shortcut: hotkeys[id] })),
    ...PACK_OPENING.map(({ id, label }) => ({
      label: `Pack Openings · ${label}`,
      shortcut: packHotkeys[id],
    })),
  ];
  const conflict = checkConflicts(entries, used);
  if (conflict) return conflict;
  for (const [account, albums] of Object.entries(albumHotkeys)) {
    const conflict = checkConflicts(
      Object.entries(albums).map(([id, shortcut]) => ({
        label: albumNames?.get(id) ?? `Pinned album ${id} (${account})`,
        shortcut,
      })),
      new Map(used),
    );
    if (conflict) return conflict;
  }
}
function checkConflicts(
  entries: { label: string; shortcut?: Shortcut }[],
  used: Map<string, string>,
) {
  for (const { label, shortcut } of entries) {
    if (!shortcut) continue;
    const key = shortcutKey(shortcut),
      previous = used.get(key);
    if (previous)
      return `${previous} and ${label} both use ${shortcutLabel(shortcut)}. Choose a different shortcut or clear one.`;
    used.set(key, label);
  }
}
export function parsePinnedAlbumHotkeys(
  value: unknown,
  pins: Record<string, string[]>,
  navigation: Hotkeys,
  pack: Hotkeys<PackOpeningId>,
): PinnedAlbumHotkeys {
  if (!value || typeof value !== "object") return {};
  const accounts = value as Record<string, unknown>;
  const global = [...Object.values(navigation), ...Object.values(pack)].map(
    shortcutKey,
  );
  return Object.fromEntries(
    Object.entries(pins).flatMap(([account, ids]) => {
      if (!Object.hasOwn(accounts, account)) return [];
      const bindings = parseBindings(
        accounts[account],
        ids.map((id) => ({ id, label: id })),
        new Set(global),
      );
      return Object.keys(bindings).length ? [[account, bindings]] : [];
    }),
  );
}
export function parseHotkeys(value: unknown): Hotkeys {
  return parseBindings(value, NAVIGATION);
}
export function parsePackOpeningHotkeys(
  value: unknown,
  navigation: Hotkeys,
): Hotkeys<PackOpeningId> {
  return parseBindings(
    value,
    PACK_OPENING,
    new Set(Object.values(navigation).map(shortcutKey)),
    true,
  );
}
function parseBindings<Id extends string>(
  value: unknown,
  actions: readonly ShortcutAction<Id>[],
  used = new Set<string>(),
  pack = false,
): Hotkeys<Id> {
  const result: Hotkeys<Id> = {};
  if (!value || typeof value !== "object") return result;
  const entries = value as Record<string, unknown>;
  for (const item of actions) {
    const raw = entries[item.id];
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Partial<Shortcut>;
    if (
      !validShortcutCode(v.code, pack) ||
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
