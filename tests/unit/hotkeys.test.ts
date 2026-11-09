import { expect, it } from "vitest";
import {
  hotkeyConflict,
  isTyping,
  NAVIGATION,
  parseHotkeys,
  shortcutFromEvent,
  shortcutLabel,
} from "../../src/shared/hotkeys";
import { parseSettings } from "../../src/shared/settings";
const key = (code: string, modifiers: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", { code, ...modifiers });
const a = shortcutFromEvent(key("KeyA", { altKey: true }))!;
it("provides all sixteen destinations without assigning shortcuts to existing users", () => {
  expect(NAVIGATION).toHaveLength(16);
  expect(parseSettings({ schemaVersion: 1 }).hotkeys).toEqual({});
  expect(NAVIGATION.find((item) => item.id === "marketAuctions")?.path).toBe(
    "/market?tab=overview&view=auctions",
  );
  expect(NAVIGATION.find((item) => item.id === "marketActivity")?.path).toBe(
    "/market?tab=overview&view=mine",
  );
  expect(NAVIGATION.find((item) => item.id === "pulsar")?.path).toBe("/games");
  expect(NAVIGATION.find((item) => item.id === "fusion")?.path).toBe("/fusion");
  expect(NAVIGATION.find((item) => item.id === "history")?.path).toBe(
    "/history",
  );
});
it("parses only valid shortcuts and deterministically discards duplicate or unknown entries", () => {
  expect(
    parseHotkeys({
      home: a,
      albums: a,
      profile: { ...a, code: "F12", meta: true },
      unknown: a,
      atlas: { ...a, code: "Escape" },
      social: { ...a, ctrl: "false" },
    }),
  ).toEqual({ home: a, profile: { ...a, code: "F12", meta: true } });
  expect(parseHotkeys(null)).toEqual({});
  expect(parseHotkeys({ home: { code: "KeyA" } })).toEqual({});
  expect(hotkeyConflict({ home: a, albums: a })).toContain(
    "Home and Albums both use Alt + A",
  );
  expect(
    hotkeyConflict({ home: a, albums: { ...a, shift: true } }),
  ).toBeUndefined();
});
it("matches exact modifiers and ignores repeats, composition, and modifier-only events", () => {
  expect(
    shortcutFromEvent(
      key("KeyA", { ctrlKey: true, altKey: true, shiftKey: true }),
    ),
  ).toEqual({ code: "KeyA", ctrl: true, alt: true, shift: true, meta: false });
  expect(
    shortcutLabel(shortcutFromEvent(key("Digit1", { ctrlKey: true }))),
  ).toBe("Ctrl + 1");
  expect(shortcutFromEvent(key("ControlLeft"))).toBeUndefined();
  expect(shortcutFromEvent(key("KeyA", { repeat: true }))).toBeUndefined();
  expect(shortcutFromEvent(key("KeyA", { isComposing: true }))).toBeUndefined();
});
it("allows pack navigation keys and keeps existing navigation bindings on storage conflicts", () => {
  const end = shortcutFromEvent(key("End"), true)!;
  expect(shortcutFromEvent(key("End"))).toBeUndefined();
  expect(shortcutLabel(shortcutFromEvent(key("ArrowRight"), true))).toBe(
    "Arrow Right",
  );
  expect(hotkeyConflict({ home: a }, { nextCard: a })).toContain(
    "Home and Pack Openings · Next Card",
  );
  expect(
    parseSettings({
      schemaVersion: 1,
      hotkeys: { home: a },
      packOpeningHotkeys: {
        nextCard: a,
        focusLastCard: end,
        previousCard: end,
      },
    }).packOpeningHotkeys,
  ).toEqual({ focusLastCard: end });
});
it("detects editing inside form controls, contenteditable regions and shadow roots", () => {
  for (const tag of ["input", "textarea", "select"]) {
    const element = document.createElement(tag);
    document.body.append(element);
    let typing = false;
    element.addEventListener("keydown", (event) => {
      typing = isTyping(event as KeyboardEvent);
    });
    element.dispatchEvent(key("KeyA"));
    expect(typing).toBe(true);
    element.remove();
  }
  const host = document.createElement("div"),
    shadow = host.attachShadow({ mode: "open" });
  const input = document.createElement("textarea");
  shadow.append(input);
  document.body.append(host);
  let typing = false;
  host.addEventListener("keydown", (event) => {
    typing = isTyping(event as KeyboardEvent);
  });
  input.dispatchEvent(key("KeyA", { bubbles: true, composed: true }));
  expect(typing).toBe(true);
  host.remove();
});
