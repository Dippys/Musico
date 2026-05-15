import type { MusicTrack } from "./types.js";

export interface LyricsLine {
  text: string;
  timeMs: number;
}

export interface LyricsResult {
  albumName: string | null;
  artist: string;
  durationMs: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  provider: "lrclib";
  syncedLyrics: readonly LyricsLine[];
  title: string;
}

export interface LyricsWindow {
  activeLine: LyricsLine | null;
  activeLineIndex: number;
  highlightedLineIndex: number;
  lines: readonly LyricsLine[];
}

export interface LyricsServiceOptions {
  apiBaseUrl?: string;
  cacheTtlMs?: number;
  requestTimeoutMs?: number;
}

interface LyricsCacheEntry {
  expiresAt: number;
  value: Promise<LyricsResult | null>;
}

interface LrcLibLyricsRecord {
  albumName: string | null;
  artistName: string;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  trackName: string;
}

const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const LRC_TIMESTAMP_PATTERN = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
const DECORATOR_PATTERN = /\s+(?:-|:|\||\/)?\s*(?:official(?:\s+(?:audio|video))?|audio|video|lyrics?|hq|hd|visuali(?:s|z)er|music\s+video)\b.*$/i;
const FEATURE_PATTERN = /\((?:feat|ft)\.?[^)]*\)|\[(?:feat|ft)\.?[^\]]*\]/gi;

const isObject = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === "object";
};

const readString = (
  value: Record<string, unknown>,
  key: string,
): string | null => {
  const candidate = value[key];

  if (typeof candidate !== "string") {
    return null;
  }

  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : null;
};

const readNullableString = (
  value: Record<string, unknown>,
  key: string,
): string | null => {
  const candidate = value[key];

  if (candidate === null || candidate === undefined) {
    return null;
  }

  if (typeof candidate !== "string") {
    return null;
  }

  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : null;
};

const readNullableNumber = (
  value: Record<string, unknown>,
  key: string,
): number | null => {
  const candidate = value[key];

  if (candidate === null || candidate === undefined) {
    return null;
  }

  if (typeof candidate !== "number" || Number.isNaN(candidate)) {
    return null;
  }

  return candidate;
};

const stripTrackDecorators = (value: string): string => {
  return value
    .replace(FEATURE_PATTERN, " ")
    .replace(DECORATOR_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeForComparison = (value: string): string => {
  return stripTrackDecorators(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const createTrackCacheKey = (
  track: Pick<MusicTrack, "artist" | "isrc" | "lengthMs" | "title">,
): string => {
  if (track.isrc) {
    return `isrc:${track.isrc.toLowerCase()}`;
  }

  return [
    normalizeForComparison(track.artist),
    normalizeForComparison(track.title),
    Math.round(track.lengthMs / 1_000).toString(),
  ].join("|");
};

const parseLrcTimestampToMs = (
  minutes: string,
  seconds: string,
  fraction: string | undefined,
): number => {
  const minuteValue = Number.parseInt(minutes, 10);
  const secondValue = Number.parseInt(seconds, 10);

  let fractionMs = 0;

  if (fraction) {
    if (fraction.length === 1) {
      fractionMs = Number.parseInt(fraction, 10) * 100;
    } else if (fraction.length === 2) {
      fractionMs = Number.parseInt(fraction, 10) * 10;
    } else {
      fractionMs = Number.parseInt(fraction.slice(0, 3), 10);
    }
  }

  return minuteValue * 60_000 + secondValue * 1_000 + fractionMs;
};

const parseSyncedLyrics = (value: string | null): readonly LyricsLine[] => {
  if (!value) {
    return [];
  }

  const lines: LyricsLine[] = [];

  for (const rawLine of value.split(/\r?\n/u)) {
    const matches = [...rawLine.matchAll(LRC_TIMESTAMP_PATTERN)];

    if (matches.length === 0) {
      continue;
    }

    const text = rawLine.replaceAll(LRC_TIMESTAMP_PATTERN, "").trim();

    if (text.length === 0) {
      continue;
    }

    for (const match of matches) {
      const minutes = match[1];
      const seconds = match[2];
      const fraction = match[3];

      if (!minutes || !seconds) {
        continue;
      }

      lines.push({
        text,
        timeMs: parseLrcTimestampToMs(minutes, seconds, fraction),
      });
    }
  }

  return lines.sort((left, right) => left.timeMs - right.timeMs);
};

const parseLyricsRecord = (value: unknown): LrcLibLyricsRecord | null => {
  if (!isObject(value)) {
    return null;
  }

  const trackName = readString(value, "trackName") ?? readString(value, "name");
  const artistName = readString(value, "artistName") ?? readString(value, "artist");

  if (!trackName || !artistName) {
    return null;
  }

  return {
    albumName: readNullableString(value, "albumName"),
    artistName,
    duration: readNullableNumber(value, "duration"),
    instrumental: value.instrumental === true,
    plainLyrics: readNullableString(value, "plainLyrics"),
    syncedLyrics: readNullableString(value, "syncedLyrics"),
    trackName,
  };
};

const scoreLyricsCandidate = (
  candidate: LrcLibLyricsRecord,
  track: Pick<MusicTrack, "artist" | "lengthMs" | "title">,
): number => {
  const normalizedTrackTitle = normalizeForComparison(track.title);
  const normalizedTrackArtist = normalizeForComparison(track.artist);
  const normalizedCandidateTitle = normalizeForComparison(candidate.trackName);
  const normalizedCandidateArtist = normalizeForComparison(candidate.artistName);

  let score = 0;

  if (normalizedCandidateTitle === normalizedTrackTitle) {
    score += 60;
  } else if (
    normalizedCandidateTitle.includes(normalizedTrackTitle) ||
    normalizedTrackTitle.includes(normalizedCandidateTitle)
  ) {
    score += 35;
  }

  if (normalizedCandidateArtist === normalizedTrackArtist) {
    score += 40;
  } else if (
    normalizedCandidateArtist.includes(normalizedTrackArtist) ||
    normalizedTrackArtist.includes(normalizedCandidateArtist)
  ) {
    score += 20;
  }

  const durationDifference =
    candidate.duration === null
      ? null
      : Math.abs(Math.round(track.lengthMs / 1_000) - candidate.duration);

  if (durationDifference !== null) {
    if (durationDifference <= 2) {
      score += 20;
    } else if (durationDifference <= 6) {
      score += 10;
    }
  }

  if (candidate.syncedLyrics) {
    score += 10;
  }

  if (candidate.plainLyrics) {
    score += 5;
  }

  return score;
};

const toLyricsResult = (record: LrcLibLyricsRecord): LyricsResult => {
  return {
    albumName: record.albumName,
    artist: record.artistName,
    durationMs: record.duration === null ? null : record.duration * 1_000,
    instrumental: record.instrumental,
    plainLyrics: record.plainLyrics,
    provider: "lrclib",
    syncedLyrics: parseSyncedLyrics(record.syncedLyrics),
    title: record.trackName,
  };
};

export const getLyricsWindow = (
  lines: readonly LyricsLine[],
  positionMs: number,
  options: {
    after?: number;
    before?: number;
  } = {},
): LyricsWindow => {
  if (lines.length === 0) {
    return {
      activeLine: null,
      activeLineIndex: -1,
      highlightedLineIndex: -1,
      lines: [],
    };
  }

  const before = options.before ?? 0;
  const after = options.after ?? 4;
  let activeLineIndex = -1;

  for (const [index, line] of lines.entries()) {
    if (line.timeMs > positionMs) {
      break;
    }

    activeLineIndex = index;
  }

  const startIndex = Math.max(0, activeLineIndex < 0 ? 0 : activeLineIndex - before);
  const endIndex = Math.min(
    lines.length,
    activeLineIndex < 0 ? after + 1 : activeLineIndex + after + 1,
  );
  const visibleLines = lines.slice(startIndex, endIndex);

  return {
    activeLine: activeLineIndex >= 0 ? lines[activeLineIndex] ?? null : null,
    activeLineIndex,
    highlightedLineIndex: activeLineIndex >= 0 ? activeLineIndex - startIndex : -1,
    lines: visibleLines,
  };
};

export class LyricsService {
  private readonly apiBaseUrl: string;

  private readonly cache = new Map<string, LyricsCacheEntry>();

  private readonly cacheTtlMs: number;

  private readonly requestTimeoutMs: number;

  public constructor(options: LyricsServiceOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://lrclib.net";
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  public async getLyrics(
    track: Pick<MusicTrack, "artist" | "isrc" | "lengthMs" | "title">,
  ): Promise<LyricsResult | null> {
    const cacheKey = createTrackCacheKey(track);
    const now = Date.now();
    const cachedEntry = this.cache.get(cacheKey);

    if (cachedEntry && cachedEntry.expiresAt > now) {
      return cachedEntry.value;
    }

    const value = this.fetchLyrics(track).catch((error) => {
      this.cache.delete(cacheKey);
      throw error;
    });

    this.cache.set(cacheKey, {
      expiresAt: now + this.cacheTtlMs,
      value,
    });

    return value;
  }

  private async fetchLyrics(
    track: Pick<MusicTrack, "artist" | "isrc" | "lengthMs" | "title">,
  ): Promise<LyricsResult | null> {
    if (track.isrc) {
      const directMatch = await this.requestSingleRecord({ isrc: track.isrc });

      if (directMatch) {
        return toLyricsResult(directMatch);
      }
    }

    const directMatch = await this.requestSingleRecord({
      artist_name: stripTrackDecorators(track.artist),
      duration: Math.round(track.lengthMs / 1_000).toString(),
      track_name: stripTrackDecorators(track.title),
    });

    if (directMatch) {
      return toLyricsResult(directMatch);
    }

    const candidates = await this.requestSearchRecords({
      artist_name: stripTrackDecorators(track.artist),
      duration: Math.round(track.lengthMs / 1_000).toString(),
      track_name: stripTrackDecorators(track.title),
    });

    const bestCandidate = [...candidates]
      .sort(
        (left, right) =>
          scoreLyricsCandidate(right, track) - scoreLyricsCandidate(left, track),
      )
      .find((candidate) => {
        return scoreLyricsCandidate(candidate, track) >= 30;
      });

    return bestCandidate ? toLyricsResult(bestCandidate) : null;
  }

  private async requestSingleRecord(
    params: Record<string, string>,
  ): Promise<LrcLibLyricsRecord | null> {
    const url = new URL("/api/get", this.apiBaseUrl);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetchJson(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Lyrics lookup failed with status ${response.status}.`);
    }

    return parseLyricsRecord(await response.json());
  }

  private async requestSearchRecords(
    params: Record<string, string>,
  ): Promise<readonly LrcLibLyricsRecord[]> {
    const url = new URL("/api/search", this.apiBaseUrl);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetchJson(url);

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`Lyrics search failed with status ${response.status}.`);
    }

    const payload = await response.json();

    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((entry) => parseLyricsRecord(entry))
      .filter((entry): entry is LrcLibLyricsRecord => entry !== null);
  }

  private async fetchJson(url: URL): Promise<Response> {
    return fetch(url, {
      headers: {
        "User-Agent": "Musico/0.1.0",
      },
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
  }
}