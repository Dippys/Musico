import { randomUUID } from "node:crypto";

import { LoadType, type Track } from "shoukaku";

import type { LavalinkService } from "./LavalinkService.js";
import { createMusicTrack, type QueueItem } from "./types.js";

export interface ResolveTracksOptions {
  requestedAt?: number;
  requestedById: string;
}

export type ResolveTracksSource = "empty" | "playlist" | "search" | "track";

export interface ResolveTracksResult {
  items: QueueItem[];
  source: ResolveTracksSource;
}

const searchPrefixPattern = /^[a-z]+search:/i;

const createQueueItem = (
  track: Track,
  options: ResolveTracksOptions,
): QueueItem => {
  return {
    id: randomUUID(),
    requestedAt: options.requestedAt ?? Date.now(),
    requestedById: options.requestedById,
    track: createMusicTrack(track),
  };
};

const isSupportedUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const toLavalinkIdentifier = (identifier: string): string => {
  const query = identifier.trim();

  if (
    query.length === 0 ||
    isSupportedUrl(query) ||
    searchPrefixPattern.test(query)
  ) {
    return query;
  }

  return `ytsearch:${query}`;
};

export class TrackResolverService {
  public constructor(private readonly lavalink: LavalinkService) {}

  public async resolve(
    identifier: string,
    options: ResolveTracksOptions,
  ): Promise<ResolveTracksResult> {
    const query = toLavalinkIdentifier(identifier);

    if (query.length === 0) {
      return {
        items: [],
        source: "empty",
      };
    }

    const node = this.lavalink.getIdealNode();

    if (!node) {
      throw new Error("No Lavalink nodes are available to resolve tracks.");
    }

    const result = await node.rest.resolve(query);

    if (!result) {
      throw new Error("Lavalink did not return a result for the requested track.");
    }

    switch (result.loadType) {
      case LoadType.TRACK:
        return {
          items: [createQueueItem(result.data, options)],
          source: "track",
        };

      case LoadType.SEARCH:
        return {
          items: result.data.map((track) => createQueueItem(track, options)),
          source: "search",
        };

      case LoadType.PLAYLIST:
        return {
          items: result.data.tracks.map((track) => createQueueItem(track, options)),
          source: "playlist",
        };

      case LoadType.EMPTY:
        return {
          items: [],
          source: "empty",
        };

      case LoadType.ERROR:
        throw new Error(`Track resolution failed: ${result.data.message}`);

      default:
        return {
          items: [],
          source: "empty",
        };
    }
  }
}