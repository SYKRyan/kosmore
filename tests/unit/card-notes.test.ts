import { afterEach, expect, it, vi } from "vitest";
import {
  cardNoteKey,
  emptyCardNote,
  parseCardNote,
  readCardNote,
  saveCardNote,
} from "../../src/shared/card-notes";
import { CardNotes } from "../../src/content/card-notes";
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
it("stores notes by normalized subject and account, independently of copies and finishes", () => {
  expect(cardNoteKey("PLAYER_A", "00042")).toBe(
    "kosmore.cardNotes.player_a.42",
  );
  expect(cardNoteKey("player_a", "42")).not.toBe(cardNoteKey("player_b", "42"));
  expect(cardNoteKey("player_a", "42")).not.toBe(cardNoteKey("player_a", "43"));
  expect(() => cardNoteKey("../bad", "42")).toThrow();
});
it("does not silently erase unsupported or oversized saved notes", () => {
  expect(parseCardNote(undefined)).toEqual(emptyCardNote());
  expect(() => parseCardNote({ schemaVersion: 2, text: "keep me" })).toThrow();
  expect(() =>
    parseCardNote({ schemaVersion: 1, text: "x".repeat(10001) }),
  ).toThrow();
  expect(
    parseCardNote({
      schemaVersion: 1,
      text: "<script>plain text</script>\nLine two",
    }).text,
  ).toContain("\nLine two");
});
function harness() {
  const data: Record<string, unknown> = {
    "kosmore.cardNotes.alice.42": { schemaVersion: 1, text: "Saved note" },
    "kosmore.friend.alice.batu": { notes: "untouched" },
  };
  const set = vi.fn(async (next: Record<string, unknown>) => {
    Object.assign(data, next);
  });
  vi.stubGlobal("chrome", {
    storage: {
      local: { get: vi.fn(async (key: string) => ({ [key]: data[key] })), set },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
  return { data, set };
}
it("saves, reloads, and clears one card without replacing other local data", async () => {
  const h = harness(),
    key = cardNoteKey("alice", "42");
  await saveCardNote(key, { schemaVersion: 1, text: "New note" });
  expect((await readCardNote(key)).text).toBe("New note");
  await saveCardNote(key, emptyCardNote());
  expect((await readCardNote(key)).text).toBe("");
  expect(h.data["kosmore.friend.alice.batu"]).toEqual({ notes: "untouched" });
});
it("keeps a note draft after a storage error and refuses cross-account saves", async () => {
  const h = harness();
  let account = { key: "alice", handle: "Alice" };
  const panel = document.createElement("section");
  document.body.append(panel);
  const editor = new CardNotes(panel, "42", { account: async () => account });
  editor.setAccount(account);
  editor.activate();
  const input = panel.querySelector("textarea")!;
  await vi.waitFor(() =>
    expect(input.disabled || panel.querySelector("fieldset")!.disabled).toBe(
      false,
    ),
  );
  input.value = "Unsaved draft";
  input.dispatchEvent(new Event("input"));
  h.set.mockRejectedValueOnce(new Error("quota exceeded"));
  (panel.querySelector("button") as HTMLButtonElement).click();
  await vi.waitFor(() => expect(panel.textContent).toContain("quota exceeded"));
  expect(input.value).toBe("Unsaved draft");
  account = { key: "bob", handle: "Bob" };
  (panel.querySelector("button") as HTMLButtonElement).click();
  await vi.waitFor(() =>
    expect(panel.textContent).toContain("account changed"),
  );
  expect(h.set).toHaveBeenCalledTimes(1);
  expect(h.data[cardNoteKey("alice", "42")]).toMatchObject({
    text: "Saved note",
  });
  editor.dispose();
});
