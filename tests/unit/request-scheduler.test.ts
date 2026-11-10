import { expect, it } from "vitest";
import {
  RequestScheduler,
  setRequestPriority,
} from "../../src/shared/request-scheduler";

it("reserves capacity for user interactions during background loading", async () => {
  const scheduler = new RequestScheduler(3);
  const background = setRequestPriority(
    new AbortController().signal,
    "background",
  );
  const releases: (() => void)[] = [];
  const starts: string[] = [];
  const load = (name: string) => async () => {
    starts.push(name);
    await new Promise<void>((resolve) => releases.push(resolve));
  };
  const tasks = ["a", "b", "c"].map((key) =>
    scheduler.run(key, background, load(key)),
  );
  await Promise.resolve();
  expect(starts).toEqual(["a", "b"]);
  const click = scheduler.run(
    "click",
    new AbortController().signal,
    async () => {
      starts.push("click");
    },
  );
  await click;
  expect(starts).toEqual(["a", "b", "click"]);
  releases.shift()!();
  await tasks[0];
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const release of releases) release();
  await Promise.all(tasks);
});

it("bounds requests, prioritizes interactions and promotes shared queued work", async () => {
  const scheduler = new RequestScheduler(2);
  const starts: string[] = [];
  const releases: (() => void)[] = [];
  let active = 0,
    peak = 0;
  const enqueue = (key: string, background = true) => {
    const signal = setRequestPriority(
      new AbortController().signal,
      background ? "background" : "foreground",
    );
    return scheduler.run(key, signal, async () => {
      starts.push(key);
      peak = Math.max(peak, ++active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
    });
  };
  const tasks = [
    enqueue("one", false),
    enqueue("two", false),
    enqueue("background"),
    enqueue("hovered"),
    enqueue("click", false),
  ];
  scheduler.promote("hovered");
  await Promise.resolve();
  expect(starts).toEqual(["one", "two"]);
  releases.shift()!();
  await tasks[0];
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(starts).toEqual(["one", "two", "hovered"]);
  releases.shift()!();
  await tasks[1];
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(starts.at(-1)).toBe("click");
  releases.shift()!();
  await tasks[3];
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(starts.at(-1)).toBe("background");
  for (const release of releases) release();
  await Promise.all(tasks);
  expect(peak).toBe(2);
});

it("removes canceled queued requests before they consume a network slot", async () => {
  const scheduler = new RequestScheduler(1);
  const controller = new AbortController();
  let release!: () => void;
  let sent = false;
  const first = scheduler.run(
    "first",
    new AbortController().signal,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const queued = scheduler.run("canceled", controller.signal, async () => {
    sent = true;
  });
  const rejected = expect(queued).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejected;
  await Promise.resolve();
  release();
  await first;
  expect(sent).toBe(false);
});

it("serves an expedited read next without adding one", async () => {
  const scheduler = new RequestScheduler(1);
  const signal = new AbortController().signal;
  const releases: (() => void)[] = [];
  const starts: string[] = [];
  const load = (name: string) => async () => {
    starts.push(name);
    await new Promise<void>((resolve) => releases.push(resolve));
  };
  const tasks = ["a", "b", "c", "d"].map((key) =>
    scheduler.run(key, signal, load(key)),
  );
  await Promise.resolve();
  expect(starts).toEqual(["a"]);
  scheduler.expedite("d");
  scheduler.expedite("missing");
  releases.shift()!();
  await new Promise((r) => setTimeout(r, 0));
  expect(starts).toEqual(["a", "d"]);
  while (releases.length || starts.length < 4) {
    releases.shift()?.();
    await new Promise((r) => setTimeout(r, 0));
  }
  await Promise.all(tasks);
  expect(starts).toEqual(["a", "d", "b", "c"]);
});

it("serves the open tooltip before work already queued for other visible features", async () => {
  const scheduler = new RequestScheduler(1);
  const normal = new AbortController().signal;
  const starts: string[] = [];
  let release!: () => void;
  const busy = scheduler.run(
    "busy",
    normal,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const queued = scheduler.run("other", normal, async () => {
    starts.push("other");
  });
  const shared = scheduler.run("tooltip", normal, async () => {
    starts.push("tooltip");
  });
  scheduler.promote("tooltip", "interactive");
  await Promise.resolve();
  release();
  await Promise.all([busy, queued, shared]);
  expect(starts).toEqual(["tooltip", "other"]);
});
