import { afterEach, describe, expect, it, vi } from "vitest";

import { LyricsService, getLyricsWindow } from "../../src/music/LyricsService.js";

describe("LyricsService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("falls back to search results and parses synced lyrics", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              artistName: "Someone Else",
              duration: 200,
              plainLyrics: "Nope",
              syncedLyrics: "[00:05.00]Wrong song",
              trackName: "Different Song",
            },
            {
              artistName: "Rick Astley",
              duration: 213,
              plainLyrics:
                "We're no strangers to love\nYou know the rules and so do I",
              syncedLyrics:
                "[00:12.00]We're no strangers to love\n[00:15.50]You know the rules and so do I",
              trackName: "Never Gonna Give You Up",
            },
          ]),
          { status: 200 },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const service = new LyricsService({ requestTimeoutMs: 100 });
    const result = await service.getLyrics({
      artist: "Rick Astley",
      isrc: null,
      lengthMs: 213_000,
      title: "Never Gonna Give You Up (Official Video)",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Never Gonna Give You Up");
    expect(result?.syncedLyrics).toEqual([
      {
        text: "We're no strangers to love",
        timeMs: 12_000,
      },
      {
        text: "You know the rules and so do I",
        timeMs: 15_500,
      },
    ]);
  });

  it("caches successful lyric lookups per track", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          artistName: "Rick Astley",
          duration: 213,
          plainLyrics: "We're no strangers to love",
          syncedLyrics: "[00:12.00]We're no strangers to love",
          trackName: "Never Gonna Give You Up",
        }),
        { status: 200 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const service = new LyricsService({ requestTimeoutMs: 100 });
    const track = {
      artist: "Rick Astley",
      isrc: null,
      lengthMs: 213_000,
      title: "Never Gonna Give You Up",
    } as const;

    await service.getLyrics(track);
    await service.getLyrics(track);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a synced lyric window around the active line", () => {
    const window = getLyricsWindow(
      [
        { text: "Line 1", timeMs: 1_000 },
        { text: "Line 2", timeMs: 4_000 },
        { text: "Line 3", timeMs: 8_000 },
      ],
      4_500,
      {
        after: 1,
        before: 1,
      },
    );

    expect(window.activeLine?.text).toBe("Line 2");
    expect(window.highlightedLineIndex).toBe(1);
    expect(window.lines.map((line) => line.text)).toEqual([
      "Line 1",
      "Line 2",
      "Line 3",
    ]);
  });
});