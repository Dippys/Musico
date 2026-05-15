import { afterEach, describe, expect, it, vi } from "vitest";

import { LyricsService, getLyricsWindow } from "../../src/music/LyricsService.js";

const createJsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), { status });
};

describe("LyricsService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("falls back to search results and parses synced lyrics", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: URL | string) => {
      const url = String(input);

      if (url.includes("/api/get")) {
        return new Response(null, { status: 404 });
      }

      if (url.includes("track_name=Never+Gonna+Give+You+Up")) {
        return createJsonResponse([
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
        ]);
      }

      return createJsonResponse([]);
    });

    vi.stubGlobal("fetch", fetchMock);

    const service = new LyricsService({ requestTimeoutMs: 100 });
    const result = await service.getLyrics({
      artist: "Rick Astley",
      isrc: null,
      lengthMs: 213_000,
      title: "Never Gonna Give You Up (Official Video)",
    });

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
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/search")),
    ).toBe(true);
  });

  it("derives canonical artist and title hints from YouTube-style metadata", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: URL | string) => {
      const url = String(input);

      if (url.includes("artist_name=DopeLyrics")) {
        throw new Error("timeout");
      }

      if (
        url.includes("artist_name=Justin+Bieber") &&
        url.includes("track_name=Beauty+And+A+Beat") &&
        url.includes("/api/search")
      ) {
        return createJsonResponse([
          {
            artistName: "Justin Bieber",
            duration: 228,
            plainLyrics: "Show you off, yeah",
            syncedLyrics: "[00:05.00]Show you off, yeah",
            trackName: "Beauty and a Beat",
          },
        ]);
      }

      return new Response(null, { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const service = new LyricsService({ requestTimeoutMs: 100 });
    const result = await service.getLyrics({
      artist: "DopeLyrics",
      isrc: null,
      lengthMs: 227_000,
      title: "Justin Bieber, Nicki Minaj – Beauty And A Beat (Lyrics)",
    });

    expect(result).not.toBeNull();
    expect(result?.artist).toBe("Justin Bieber");
    expect(result?.title).toBe("Beauty and a Beat");

    const requestedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(
      requestedUrls.some((url) => {
        return (
          url.includes("artist_name=Justin+Bieber") &&
          url.includes("track_name=Beauty+And+A+Beat") &&
          !url.includes("track_name=Beauty+And+A+Beat+%28Lyrics%29")
        );
      }),
    ).toBe(true);
  });

  it("caches successful lyric lookups per track", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      return createJsonResponse([
        {
          artistName: "Rick Astley",
          duration: 213,
          plainLyrics: "We're no strangers to love",
          syncedLyrics: "[00:12.00]We're no strangers to love",
          trackName: "Never Gonna Give You Up",
        },
      ]);
    });

    vi.stubGlobal("fetch", fetchMock);

    const service = new LyricsService({ requestTimeoutMs: 100 });
    const track = {
      artist: "Rick Astley",
      isrc: null,
      lengthMs: 213_000,
      title: "Never Gonna Give You Up",
    } as const;

    await service.getLyrics(track);
    const requestCountAfterFirstLookup = fetchMock.mock.calls.length;
    await service.getLyrics(track);

    expect(requestCountAfterFirstLookup).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(requestCountAfterFirstLookup);
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