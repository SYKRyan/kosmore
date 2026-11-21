import { GameClient } from "../../src/kosmora/client";
import { afterEach, expect, it, vi } from "vitest";
import { RemainingPacks } from "../../src/content/remaining-packs";

const summary =
  '<div class="ko-summary"><div class="op-actions-stack"><button class="btn-gold btn-lg">Next Pack</button></div></div>';

afterEach(() => {
  history.replaceState(null, "", "/");
  document.body.replaceChildren();
});

it("checks each summary once despite rerenders, visibility toggles, and elapsed time", async () => {
  const readyPackIds = vi.fn(async () => ["first", "second", "third"]);
  let enabled = true;
  const remaining = new RemainingPacks({ readyPackIds }, () => enabled);
  history.replaceState(null, "", "/packs/open?id=first");
  remaining.refresh();
  expect(readyPackIds).not.toHaveBeenCalled();

  document.body.innerHTML = summary;
  remaining.refresh();
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("2 packs ready"),
  );
  document.body.innerHTML = summary;
  enabled = false;
  remaining.refresh();
  enabled = true;
  remaining.refresh();
  expect(readyPackIds).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain("2 packs ready");

  history.replaceState(null, "", "/packs/open?id=second");
  remaining.refresh();
  remaining.refresh();
  expect(readyPackIds).toHaveBeenCalledTimes(2);
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("2 packs ready"),
  );
});

it("reuses only a complete inventory captured for the current summary", async () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const fetcher = vi.fn(async () => Response.json({ packs: [] }));
  const client = new GameClient(fetcher);
  history.replaceState(null, "", "/packs/open?id=first");
  const packs = [{ status: "ready", openingId: id }];
  client.observeInventory({ packs, next: "another-page" }, location.href);
  expect(await client.readyPackIds()).toEqual([]);
  client.observeInventory({ packs, total: 1 }, location.href);
  expect(await client.readyPackIds()).toEqual([id]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  history.replaceState(null, "", "/packs/open?id=second");
  expect(await client.readyPackIds()).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
