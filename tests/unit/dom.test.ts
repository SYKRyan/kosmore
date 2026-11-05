import { beforeEach, it, expect } from "vitest";
import {
  cardOverlayTargets,
  contextKey,
  resolveCard,
} from "../../src/kosmora/dom";
import { face, OPENING } from "../fixtures/data";
beforeEach(() => {
  document.body.innerHTML = "";
  history.replaceState(null, "", "/collection");
});
it("detects a front card when hovering its decorative aria-hidden gem", () => {
  document.body.innerHTML = face();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  document.querySelector(".kc")!.append(svg);
  expect(resolveCard(svg)?.subjectId).toBe("42");
});
it("resolves ordinary linked cards and normalizes padded printed IDs", () => {
  document.body.innerHTML = `<a href="/card/42">${face()}</a>`;
  expect(resolveCard(document.querySelector("img")!)?.subjectId).toBe("42");
  document.querySelector("a")!.removeAttribute("href");
  document.querySelector("img")!.removeAttribute("src");
  expect(resolveCard(document.querySelector("h3")!)?.subjectId).toBe("42");
});
it("resolves a recap overlay and preserves pack entry index for repeated subjects", () => {
  history.replaceState(null, "", `/packs/open?id=${OPENING}&recap=1`);
  document.body.innerHTML = `<div class="ko-summary"><ul class="ko-grid"><li>${face()}<button class="ko-grid-open"></button></li><li>${face()}<button class="ko-grid-open"></button></li></ul></div>`;
  const controls = document.querySelectorAll("button");
  const a = resolveCard(controls[0])!,
    b = resolveCard(controls[1])!;
  expect(b.entryIndex).toBe(1);
  expect(contextKey(a)).not.toBe(contextKey(b));
  expect(b.openingIds).toEqual([OPENING]);
});
it("ignores hidden backs and unrevealed faces", () => {
  document.body.innerHTML = `<div class="ko-card"><div class="ko-face-front">${face()}</div></div>`;
  const name = document.querySelector("h3")!;
  expect(resolveCard(name)).toBeNull();
  document.querySelector(".ko-card")!.classList.add("ko-beat-shown");
  expect(resolveCard(name)?.surface).toBe("reveal");
  document.querySelector(".kc-article")!.setAttribute("aria-hidden", "true");
  expect(resolveCard(name)).toBeNull();
});
it("resolves reveal slot changes even when the subject does not change", () => {
  document.body.innerHTML = `<div class="ko-card ko-beat-shown"><div class="ko-face-front">${face()}</div></div><ol class="ko-tray"><li class="on"></li><li></li></ol>`;
  const target = document.querySelector("h3")!;
  const a = resolveCard(target)!;
  document.querySelectorAll(".ko-tray li")[1].className = "on";
  expect(contextKey(resolveCard(target)!)).not.toBe(contextKey(a));
});
it("recognizes full-art and shiny flags independently", () => {
  document.body.innerHTML = face("42", "Northern Lights", "kc-fa kc-veil");
  expect(resolveCard(document.querySelector("h3")!)?.variant).toEqual({
    veil: true,
    fullArt: true,
  });
});
it("reads copy identifiers from card links without inferring ownership", () => {
  document.body.innerHTML = `<a href="/card/42?copy=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">${face()}</a>`;
  expect(resolveCard(document.querySelector("img")!)?.copyId).toBe(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
});
it("enumerates visual cards once while ignoring plain card links and hidden backs", () => {
  document.body.innerHTML = `<a href="/card/42">${face()}</a><a href="/card/99">A history entry</a><div hidden>${face("43")}</div>`;
  expect([...cardOverlayTargets().values()].map((c) => c.subjectId)).toEqual([
    "42",
  ]);
});
it("re-identifies an unlinked recap card when its face is replaced", () => {
  history.replaceState(null, "", `/packs/open?id=${OPENING}&recap=1`);
  document.body.innerHTML = `<div class="ko-summary"><ul class="ko-grid"><li>${face()}<button class="ko-grid-open"></button></li></ul></div>`;
  expect([...cardOverlayTargets().values()][0]).toMatchObject({
    subjectId: "42",
    surface: "summary",
    entryIndex: 0,
  });
  document.querySelector(".kc-article")!.outerHTML = face("43", "Voyager 1");
  expect([...cardOverlayTargets().values()][0].subjectId).toBe("43");
});
