import { it, expect, vi } from "vitest";
import { GameClient } from "../../src/kosmora/client";
import {
  ALBUM_A,
  COPY_A,
  COPY_B,
  albums,
  card,
  me,
  opening,
} from "../fixtures/data";
import type { CardContext } from "../../src/shared/types";
it("honors server throttling without retrying or sending further requests during the cooldown", async () => {
  const fetcher = vi.fn(async () =>
    Response.json(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": "10" } },
    ),
  );
  const client = new GameClient(fetcher as typeof fetch);
  await expect(client.account()).rejects.toThrow("rate limiting");
  await expect(client.account()).rejects.toThrow("rate limiting");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
function harness({
  contains = false,
  timeout = false,
  full = false,
  other = false,
} = {}) {
  let added = contains,
    posts = 0;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST") {
        posts++;
        added = true;
        if (timeout) throw new TypeError("network failed after commit");
        return Response.json({ added: 1 });
      }
      if (path === "/api/me")
        return Response.json({
          ...me,
          handle: other ? "OtherAccount" : me.handle,
        });
      if (path.startsWith("/api/collection/")) return Response.json(card());
      if (path.startsWith("/api/albums")) {
        const d = albums(added);
        if (full) d.albums[0].items = 2000;
        return Response.json(d);
      }
      if (path.startsWith("/api/openings/")) return Response.json(opening);
      throw Error(path);
    },
  );
  return {
    client: new GameClient(fetcher as typeof fetch),
    fetcher,
    posts: () => posts,
  };
}
it("checks membership and never toggles or rewrites an existing album", async () => {
  const h = harness({ contains: true });
  await h.client.add(
    ALBUM_A,
    {
      id: COPY_A,
      subjectId: "42",
      state: "available",
      variant: { veil: false, fullArt: false },
    },
    "fixtureplayer",
  );
  expect(h.posts()).toBe(0);
});
it("uses only the explicit add endpoint and confirms a timeout without repeating the write", async () => {
  const h = harness({ timeout: true });
  await h.client.add(
    ALBUM_A,
    {
      id: COPY_A,
      subjectId: "42",
      state: "available",
      variant: { veil: false, fullArt: false },
    },
    "fixtureplayer",
  );
  expect(h.posts()).toBe(1);
  const write = h.fetcher.mock.calls.find(([, i]) => i?.method === "POST")!;
  expect(write[0]).toBe(`/api/albums/${ALBUM_A}/items`);
  expect(JSON.parse(write[1]!.body as string)).toEqual({
    subjectIds: ["42"],
    copyId: COPY_A,
  });
});
it("rejects unowned copies, full albums, and account switches before writing", async () => {
  for (const opts of [{ full: true }, { other: true }, {}]) {
    const h = harness(opts);
    await expect(
      h.client.add(
        ALBUM_A,
        {
          id: opts.full || opts.other ? COPY_A : COPY_B,
          subjectId: "42",
          state: "available",
          variant: { veil: false, fullArt: false },
        },
        "fixtureplayer",
      ),
    ).rejects.toThrow();
    expect(h.posts()).toBe(0);
  }
});
it("resolves repeated subjects by verified opening slot plus identity", async () => {
  const h = harness();
  await h.client.account();
  const copies = [...card().copies, { ...card().copies[0], id: COPY_B }].map(
    (c) => ({
      id: c.id,
      subjectId: "42",
      state: c.state,
      variant: { veil: false, fullArt: false },
    }),
  );
  const ctx = {
    subjectId: "42",
    name: "Northern Lights",
    anchor: document.body,
    surface: "summary",
    openingIds: [opening.id],
    entryIndex: 1,
    variant: { veil: false, fullArt: false },
  } as CardContext;
  expect((await h.client.resolveCopy(ctx, copies))?.id).toBe(COPY_B);
  expect(
    await h.client.resolveCopy({ ...ctx, entryIndex: undefined }, copies),
  ).toBeUndefined();
});
