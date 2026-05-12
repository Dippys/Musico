import type { Track } from "shoukaku";

import type { FilterPreset } from "./filters.js";

export const autoplayModes = ["off", "related"] as const;
export const repeatModes = ["off", "track", "queue"] as const;

export type AutoplayMode = (typeof autoplayModes)[number];
export type RepeatMode = (typeof repeatModes)[number];

export interface MusicTrack {
  artist: string;
  artworkUrl: string | null;
  encoded: string;
  identifier: string;
  isSeekable: boolean;
  isStream: boolean;
  isrc: string | null;
  lengthMs: number;
  pluginInfo: unknown;
  positionMs: number;
  sourceName: string;
  title: string;
  uri: string | null;
}

export interface QueueItem {
  id: string;
  requestedAt: number;
  requestedById: string;
  track: MusicTrack;
}

export interface QueueState {
  autoplayMode: AutoplayMode;
  currentItem: QueueItem | null;
  history: readonly QueueItem[];
  items: readonly QueueItem[];
  repeatMode: RepeatMode;
}

export type GuildConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting";

export interface GuildPlayerVoiceState {
  channelId: string | null;
  isStageChannel: boolean;
  lastChannelId: string | null;
  selfDeaf: boolean;
  selfMute: boolean;
  shardId: number | null;
  status: GuildConnectionStatus;
  suppressed: boolean;
}

export interface GuildPlayerState {
  autoplayMode: AutoplayMode;
  currentItem: QueueItem | null;
  filterPreset: FilterPreset;
  guildId: string;
  history: readonly QueueItem[];
  lastError: string | null;
  nowPlayingMessageId: string | null;
  paused: boolean;
  playbackPositionMs: number;
  queue: readonly QueueItem[];
  repeatMode: RepeatMode;
  textChannelId: string | null;
  voice: GuildPlayerVoiceState;
  volume: number;
}

export const createMusicTrack = (track: Track): MusicTrack => {
  return {
    artist: track.info.author,
    artworkUrl: track.info.artworkUrl ?? null,
    encoded: track.encoded,
    identifier: track.info.identifier,
    isSeekable: track.info.isSeekable,
    isStream: track.info.isStream,
    isrc: track.info.isrc ?? null,
    lengthMs: track.info.length,
    pluginInfo: track.pluginInfo,
    positionMs: track.info.position,
    sourceName: track.info.sourceName,
    title: track.info.title,
    uri: track.info.uri ?? null,
  };
};