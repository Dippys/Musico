import { LoadType } from "shoukaku";
import { describe, expect, it, vi } from "vitest";

import { TrackResolverService } from "../../src/music/TrackResolverService.js";

const createTrack = (id: string) => ({
  encoded: `encoded-${id}`,
  info: {
    author: `Artist ${id}`,
    artworkUrl: null,
    identifier: `identifier-${id}`,
    isSeekable: true,
    isStream: false,
    isrc: null,
    length: 180000,
    position: 0,
    sourceName: "youtube",
    title: `Track ${id}`,
    uri: `https://example.com/${id}`,
  },
  pluginInfo: {},
});

describe("TrackResolverService", () => {
  it("prefixes plain search queries for Lavalink and preserves search results", async () => {
    const resolve = vi.fn().mockResolvedValue({
      data: [createTrack("first"), createTrack("second")],
      loadType: LoadType.SEARCH,
    });
    const service = new TrackResolverService({
      getIdealNode: () => ({
        rest: {
          resolve,
        },
      }),
    } as never);

    const result = await service.resolve("never gonna give you up", {
      requestedById: "user-1",
    });

    expect(resolve).toHaveBeenCalledWith("ytsearch:never gonna give you up");
    expect(result.source).toBe("search");
    expect(result.items).toHaveLength(2);
  });

  it("passes direct URLs through unchanged", async () => {
    const resolve = vi.fn().mockResolvedValue({
      data: createTrack("direct"),
      loadType: LoadType.TRACK,
    });
    const service = new TrackResolverService({
      getIdealNode: () => ({
        rest: {
          resolve,
        },
      }),
    } as never);

    const result = await service.resolve("https://example.com/track", {
      requestedById: "user-1",
    });

    expect(resolve).toHaveBeenCalledWith("https://example.com/track");
    expect(result.source).toBe("track");
    expect(result.items).toHaveLength(1);
  });
});