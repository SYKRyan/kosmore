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
  missingAlbum = false,
  unknownMembership = false,
  removeFailure = false,
  removeNoChange = false,
} = {}) {
  let added = contains,
    posts = 0,
    deletes = 0;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "DELETE") {
        deletes++;
        // Kosmora's JSON transport sends {} even when the caller supplies no payload.
        if (init.body !== "{}")
          return Response.json({ code: "invalid_json" }, { status: 400 });
        if (removeFailure)
          return Response.json({ error: "unavailable" }, { status: 503 });
        if (!removeNoChange) added = false;
        if (timeout) throw new TypeError("network failed after commit");
        return Response.json({ position: 1, copyId: COPY_B });
      }
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
        if (unknownMembership)
          delete (d.albums[0] as { contains?: boolean }).contains;
        if (missingAlbum) d.albums = [];
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
    deletes: () => deletes,
  };
}
it("removes the exact album subject without requiring a selected or currently owned copy", async () => {
  const h = harness({ contains: true });
  await h.client.remove(ALBUM_A, "00042", "fixtureplayer");
  expect(h.deletes()).toBe(1);
  expect(h.posts()).toBe(0);
  const deletion = h.fetcher.mock.calls.find(
    ([, init]) => init?.method === "DELETE",
  )!;
  expect(deletion[0]).toBe(`/api/albums/${ALBUM_A}/items/42`);
  expect(deletion[1]?.body).toBe("{}");
  expect(deletion[1]?.headers).toMatchObject({
    "x-kosmora": "1",
    "Content-Type": "application/json",
  });
  expect(
    h.fetcher.mock.calls.some(([path]) =>
      String(path).startsWith("/api/collection/"),
    ),
  ).toBe(false);
});
it("confirms a committed removal after a lost response without retrying DELETE", async () => {
  const h = harness({ contains: true, timeout: true });
  await h.client.remove(ALBUM_A, "42", "fixtureplayer");
  expect(h.deletes()).toBe(1);
  expect(h.posts()).toBe(0);
});
it("does not remove an absent subject or write after unverified membership or an account change", async () => {
  const absent = harness();
  await absent.client.remove(ALBUM_A, "42", "fixtureplayer");
  expect(absent.deletes()).toBe(0);
  for (const options of [
    { other: true },
    { missingAlbum: true },
    { unknownMembership: true },
  ]) {
    const h = harness({ contains: true, ...options });
    await expect(
      h.client.remove(ALBUM_A, "42", "fixtureplayer"),
    ).rejects.toThrow();
    expect(h.deletes()).toBe(0);
    expect(h.posts()).toBe(0);
  }
});
it("rejects invalid removal identifiers and never reports an unconfirmed removal as success", async () => {
  const h = harness({ contains: true });
  await expect(h.client.remove("bad", "42", "fixtureplayer")).rejects.toThrow();
  await expect(
    h.client.remove(ALBUM_A, "42/anything", "fixtureplayer"),
  ).rejects.toThrow();
  expect(h.fetcher).not.toHaveBeenCalled();
  for (const options of [{ removeFailure: true }, { removeNoChange: true }]) {
    const failed = harness({ contains: true, ...options });
    await expect(
      failed.client.remove(ALBUM_A, "42", "fixtureplayer"),
    ).rejects.toThrow();
    expect(failed.deletes()).toBe(1);
    expect(failed.posts()).toBe(0);
  }
});
it("serializes removals and additions for the same album subject", async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let contains = true;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        await held;
        contains = false;
        return Response.json({});
      }
      return Response.json(String(input) === "/api/me" ? me : albums(contains));
    },
  );
  const client = new GameClient(fetcher as typeof fetch);
  const pending = client.remove(ALBUM_A, "42", "fixtureplayer");
  await expect(client.remove(ALBUM_A, "42", "fixtureplayer")).rejects.toThrow(
    "already in progress",
  );
  await expect(
    client.add(
      ALBUM_A,
      {
        id: COPY_A,
        subjectId: "42",
        state: "available",
        variant: { veil: false, fullArt: false },
      },
      "fixtureplayer",
    ),
  ).rejects.toThrow("already in progress");
  release();
  await pending;
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(1);
});
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
