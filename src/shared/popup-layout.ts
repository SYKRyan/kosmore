export type PopupTab = "market" | "history" | "trade" | "notes";
function isPopupTab(value: unknown): value is PopupTab {
  return (
    value === "market" ||
    value === "history" ||
    value === "trade" ||
    value === "notes"
  );
}
export interface PopupPosition {
  left: number;
  top: number;
}
export interface PopupState {
  pinned: boolean;
  position: PopupPosition | null;
  tab?: PopupTab;
}
export interface PopupLayoutChange {
  tab?: PopupTab;
  pinned?: boolean;
  position?: PopupPosition;
  width?: number;
  height?: number;
}
export const POPUP_SESSION_PREFIX = "kosmore.popup.";
export const FRIEND_POPUP_SESSION_PREFIX = "kosmore.friendPopup.";
export function parsePopupPosition(value: unknown): PopupPosition | null {
  if (!value || typeof value !== "object") return null;
  const position = value as PopupPosition;
  if (
    ![position.left, position.top].every(
      (n) =>
        typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100000,
    )
  )
    return null;
  return { left: Math.round(position.left), top: Math.round(position.top) };
}
export function parsePopupState(value: unknown): PopupState {
  if (!value || typeof value !== "object")
    return { pinned: false, position: null };
  const state = value as PopupState;
  return {
    pinned: state.pinned === true,
    position: parsePopupPosition(state.position),
    ...(isPopupTab(state.tab) ? { tab: state.tab } : {}),
  };
}
export function isPopupLayoutChange(
  value: unknown,
  limits = { minWidth: 320, minHeight: 480 },
): value is PopupLayoutChange {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const change = value as PopupLayoutChange;
  return (
    Object.keys(change).every((key) =>
      ["pinned", "position", "width", "height", "tab"].includes(key),
    ) &&
    (change.tab === undefined || isPopupTab(change.tab)) &&
    (change.pinned === undefined || typeof change.pinned === "boolean") &&
    (change.position === undefined ||
      parsePopupPosition(change.position) !== null) &&
    (change.width === undefined ||
      (Number.isFinite(change.width) &&
        change.width >= limits.minWidth &&
        change.width <= 1200)) &&
    (change.height === undefined ||
      (Number.isFinite(change.height) &&
        change.height >= limits.minHeight &&
        change.height <= 1600))
  );
}
export interface PopupBounds extends PopupPosition {
  width: number;
  height: number;
}
export function resizedBounds(
  start: PopupBounds,
  edge: string,
  dx: number,
  dy: number,
  viewport: { width: number; height: number },
  limits = { minWidth: 320, minHeight: 480 },
): PopupBounds {
  const bounds = { ...start },
    right = start.left + start.width,
    bottom = start.top + start.height;
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(n, max));
  if (edge.includes("e"))
    bounds.width = clamp(
      start.width + dx,
      Math.min(limits.minWidth, viewport.width - 12 - start.left),
      Math.min(1200, viewport.width - 12 - start.left),
    );
  if (edge.includes("s"))
    bounds.height = clamp(
      start.height + dy,
      Math.min(limits.minHeight, viewport.height - 12 - start.top),
      Math.min(1600, viewport.height - 12 - start.top),
    );
  if (edge.includes("w")) {
    bounds.left = clamp(
      start.left + dx,
      Math.max(12, right - 1200),
      right - Math.min(limits.minWidth, right - 12),
    );
    bounds.width = right - bounds.left;
  }
  if (edge.includes("n")) {
    bounds.top = clamp(
      start.top + dy,
      Math.max(12, bottom - 1600),
      bottom - Math.min(limits.minHeight, bottom - 12),
    );
    bounds.height = bottom - bounds.top;
  }
  return bounds;
}
