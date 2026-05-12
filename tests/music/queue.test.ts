import { describe, expect, it } from "vitest";

import { QueueService } from "../../src/music/QueueService.js";
import type { QueueItem } from "../../src/music/types.js";

const createQueueItem = (id: string): QueueItem => ({
  id,
  requestedAt: 1,
  requestedById: "123456789012345678",
  track: {
    artist: `Artist ${id}`,
    artworkUrl: null,
    encoded: `encoded-${id}`,
    identifier: `identifier-${id}`,
    isSeekable: true,
    isStream: false,
    isrc: null,
    lengthMs: 180000,
    pluginInfo: null,
    positionMs: 0,
    sourceName: "youtube",
    title: `Track ${id}`,
    uri: `https://example.com/${id}`,
  },
});

describe("QueueService", () => {
  it("adds items to the tail and front of the queue", () => {
    const queue = new QueueService();
    const first = createQueueItem("first");
    const second = createQueueItem("second");
    const urgent = createQueueItem("urgent");

    queue.add(first);
    queue.add(second);
    queue.addNext(urgent);

    expect(queue.snapshot().items.map((item) => item.id)).toEqual([
      "urgent",
      "first",
      "second",
    ]);
  });

  it("removes, moves, clears, and shuffles queued items", () => {
    const alpha = createQueueItem("alpha");
    const beta = createQueueItem("beta");
    const gamma = createQueueItem("gamma");
    const queue = new QueueService({ items: [alpha, beta, gamma] });

    expect(queue.remove(1)?.id).toBe("beta");
    expect(queue.move(1, 0)).toBe(true);
    expect(queue.snapshot().items.map((item) => item.id)).toEqual([
      "gamma",
      "alpha",
    ]);

    const randomValues = [0];
    queue.shuffle(() => randomValues.shift() ?? 0);

    expect(queue.snapshot().items.map((item) => item.id)).toEqual([
      "alpha",
      "gamma",
    ]);
    expect(queue.clear().map((item) => item.id)).toEqual(["alpha", "gamma"]);
    expect(queue.snapshot().items).toEqual([]);
  });

  it("rejects invalid queue positions without mutating the queue", () => {
    const alpha = createQueueItem("alpha");
    const beta = createQueueItem("beta");
    const queue = new QueueService({ items: [alpha, beta] });

    expect(queue.remove(-1)).toBeNull();
    expect(queue.remove(4)).toBeNull();
    expect(queue.move(-1, 0)).toBe(false);
    expect(queue.move(0, 4)).toBe(false);
    expect(queue.snapshot().items.map((item) => item.id)).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("advances through the queue and records history", () => {
    const first = createQueueItem("first");
    const second = createQueueItem("second");
    const queue = new QueueService({ items: [first, second] });

    expect(queue.next()?.id).toBe("first");
    expect(queue.next()?.id).toBe("second");

    const snapshot = queue.snapshot();

    expect(snapshot.currentItem?.id).toBe("second");
    expect(snapshot.history.map((item) => item.id)).toEqual(["first"]);
    expect(snapshot.items).toEqual([]);
  });

  it("repeats the current track without consuming the queue", () => {
    const current = createQueueItem("current");
    const nextUp = createQueueItem("next");
    const queue = new QueueService({
      currentItem: current,
      items: [nextUp],
      repeatMode: "track",
    });

    expect(queue.next()?.id).toBe("current");
    expect(queue.snapshot().items.map((item) => item.id)).toEqual(["next"]);
    expect(queue.snapshot().history).toEqual([]);
    expect(queue.next({ force: true })?.id).toBe("next");
  });

  it("cycles the queue when queue repeat is enabled", () => {
    const first = createQueueItem("first");
    const second = createQueueItem("second");
    const queue = new QueueService({
      currentItem: first,
      items: [second],
      repeatMode: "queue",
    });

    expect(queue.next()?.id).toBe("second");
    expect(queue.snapshot().items.map((item) => item.id)).toEqual(["first"]);
    expect(queue.snapshot().history.map((item) => item.id)).toEqual(["first"]);
  });
});