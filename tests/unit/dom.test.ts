import { beforeEach, it, expect } from "vitest";
import {
  cardOverlayTargets,
  contextKey,
  resolveCard,
} from "../../src/kosmora/dom";
import { face, OPENING } from "../fixtures/data";
import { batchSellRow, sellPickerTile } from "../fixtures/sell-many";
import {
  activityRow,
  journalRow,
  marketActivityFixture,
} from "../fixtures/market-activity";
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
it("resolves thumbnails, names and summaries in the three market activity sections", () => {
  history.replaceState(null, "", "/market?tab=overview&view=mine");
  document.body.innerHTML = marketActivityFixture();
  for (const [section, id, name, variant] of [
    ["dash-turn", "42", "Northern Lights", { veil: true, fullArt: false }],
    ["dash-bids", "46", "Andromeda", { veil: false, fullArt: true }],
    ["dash-sale", "47", "Orion Nebula", { veil: false, fullArt: false }],
  ] as const) {
    const root = document.querySelector(`[data-testid='${section}']`)!;
    const link = root.querySelector("a")!;
    for (const target of [
      link,
      root.querySelector("img")!,
      root.querySelector(".ui-line")!,
    ]) {
      expect(resolveCard(target)).toMatchObject({
        subjectId: id,
        name,
        variant,
        anchor: link,
        surface: "page",
      });
      expect(resolveCard(target)?.copyId).toBeUndefined();
    }
  }
  expect(
    [...cardOverlayTargets().values()].map((context) => context.subjectId),
  ).toEqual([]);
  document.body.insertAdjacentHTML("beforeend", face("99", "Ordinary card"));
  expect(
    [...cardOverlayTargets().values()].map((context) => context.subjectId),
  ).toEqual(["99"]);
});
it("does not treat auction IDs or action controls as card identity", () => {
  history.replaceState(null, "", "/market?tab=overview&view=mine");
  document.body.innerHTML = activityRow("42", "Northern Lights");
  expect(resolveCard(document.querySelector("button")!)).toBeNull();
  document.querySelector(".kc-article")!.remove();
  expect(resolveCard(document.querySelector(".mk-act-name")!)).toBeNull();
});
it("resolves both expanded and collapsed journal rows from their card face and visible name", () => {
  history.replaceState(null, "", "/market?tab=overview&view=mine");
  for (const container of ["md-journal", "md-results"]) {
    document.body.innerHTML = `<section class="${container}"><ul class="md-ledger">${journalRow("48", "Cassini", "kc-veil")}</ul></section>`;
    const link = document.querySelector("a")!;
    for (const target of [
      link,
      document.querySelector("img")!,
      document.querySelector(".md-ledger-name")!,
      document.querySelector(".md-ledger-amount")!,
    ]) {
      expect(resolveCard(target)).toMatchObject({
        subjectId: "48",
        name: "Cassini",
        anchor: link,
        variant: { veil: true, fullArt: false },
      });
      expect(resolveCard(target)?.copyId).toBeUndefined();
    }
    expect([...cardOverlayTargets()]).toHaveLength(0);
    document.querySelector("li")!.hidden = true;
    expect(resolveCard(link)).toBeNull();
    document.querySelector("li")!.hidden = false;
    document.querySelector(".kc-article")!.remove();
    expect(resolveCard(link)).toBeNull();
  }
});
it("keeps hidden rows, mystery backs and unrelated decorative cards excluded", () => {
  history.replaceState(null, "", "/market?tab=overview&view=mine");
  for (const attribute of ["hidden", 'aria-hidden="true"', "inert"]) {
    document.body.innerHTML = `<div ${attribute}>${activityRow("42", "Northern Lights")}</div>`;
    expect(resolveCard(document.querySelector("img")!)).toBeNull();
  }
  document.body.innerHTML = `<div aria-hidden="true">${face()}</div>`;
  expect(resolveCard(document.querySelector("img")!)).toBeNull();
  document.body.innerHTML = activityRow("42", "Mystery card");
  document.querySelector(".kc-article")!.outerHTML =
    '<div class="kc-back">Mystery card</div>';
  expect(resolveCard(document.querySelector(".mk-act-name")!)).toBeNull();
});
it("resolves Sell Many picker hit targets and keyboard focus to the underlying face", () => {
  history.replaceState(null, "", "/market");
  document.body.innerHTML = `<ul data-testid="sell-sheet-grid">${sellPickerTile("42", "Northern Lights", "kc-veil")}</ul>`;
  const hit = document.querySelector(".pick-hit")!;
  expect(resolveCard(hit)).toMatchObject({
    subjectId: "42",
    name: "Northern Lights",
    variant: { veil: true, fullArt: false },
    anchor: document.querySelector(".pick"),
  });
  expect(resolveCard(document.querySelector(".kc-img")!)?.anchor).toBe(
    resolveCard(hit)?.anchor,
  );
  document.querySelector(".kc-article")!.remove();
  expect(resolveCard(hit)).toBeNull();
});
it("resolves shared multi-select overlays outside the Sell picker", () => {
  for (const path of [
    "/collection",
    "/albums/fixture",
    "/friends/batu/collection",
  ]) {
    history.replaceState(null, "", path);
    document.body.innerHTML = `<ul>${sellPickerTile("42", "Northern Lights", "kc-veil")}${sellPickerTile("46", "Andromeda", "kc-fa")}</ul>`;
    const picks = document.querySelectorAll<HTMLElement>(".pick");
    for (const [index, id, variant] of [
      [0, "42", { veil: true, fullArt: false }],
      [1, "46", { veil: false, fullArt: true }],
    ] as const) {
      const pick = picks[index],
        hit = pick.querySelector("button")!;
      hit.innerHTML = '<span aria-hidden="true">Select</span>';
      hit.setAttribute("aria-pressed", index === 0 ? "true" : "false");
      for (const target of [
        pick,
        hit,
        hit.firstElementChild!,
        pick.querySelector("img")!,
      ])
        expect(resolveCard(target)).toMatchObject({
          subjectId: id,
          variant,
          anchor: pick,
          copyId: undefined,
        });
      expect(contextKey(resolveCard(hit)!)).toBe(
        contextKey(resolveCard(pick.querySelector("img")!)!),
      );
      for (const attribute of ["hidden", "inert", "aria-hidden"]) {
        pick.setAttribute(attribute, attribute === "aria-hidden" ? "true" : "");
        expect(resolveCard(hit)).toBeNull();
        pick.removeAttribute(attribute);
      }
      pick.querySelector(".kc-article")!.remove();
      expect(resolveCard(hit)).toBeNull();
    }
  }
});
it("resolves batch-sale thumbnails and names without treating price/copy controls as cards", () => {
  history.replaceState(null, "", "/market/sell/batch?s=46.f");
  document.body.innerHTML = `<ul class="bsell-list">${batchSellRow("46", "Andromeda", "kc-fa")}</ul>`;
  for (const target of [
    document.querySelector(".kc-img")!,
    document.querySelector(".bsell-name")!,
  ])
    expect(resolveCard(target)).toMatchObject({
      subjectId: "46",
      name: "Andromeda",
      variant: { veil: false, fullArt: true },
      anchor: document.querySelector(".bsell-head"),
      copyId: undefined,
    });
  for (const target of document.querySelectorAll("button, input"))
    expect(resolveCard(target)).toBeNull();
  expect(cardOverlayTargets().size).toBe(0);
  document.querySelector(".bsell-row")!.setAttribute("hidden", "");
  expect(resolveCard(document.querySelector(".kc-img")!)).toBeNull();
});
