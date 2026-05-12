import { ChannelType, type Guild, type VoiceBasedChannel, type VoiceState } from "discord.js";
import type { Player, TrackEndReason } from "shoukaku";

import type { AppEnv } from "../config/schema.js";
import { logger } from "../logging/logger.js";
import {
  getFiltersForPreset,
  type FilterPreset,
} from "./filters.js";
import type { GuildSettingsStore } from "./GuildSettingsStore.js";
import type { LavalinkService } from "./LavalinkService.js";
import { QueueService } from "./QueueService.js";
import type {
  GuildPlayerState,
  GuildPlayerVoiceState,
  QueueItem,
} from "./types.js";

export interface ConnectToVoiceChannelOptions {
  selfDeaf?: boolean;
  selfMute?: boolean;
  textChannelId?: string | null;
}

export interface EnqueueTracksOptions {
  position?: "back" | "next";
  startIfIdle?: boolean;
}

export interface EnqueueTracksResult {
  enqueuedItems: readonly QueueItem[];
  startedItem: QueueItem | null;
  state: GuildPlayerState;
}

export interface ClearQueueResult {
  clearedItems: readonly QueueItem[];
  state: GuildPlayerState;
}

export interface MoveQueueItemResult {
  moved: boolean;
  state: GuildPlayerState;
}

export interface RemoveQueueItemResult {
  removedItem: QueueItem | null;
  state: GuildPlayerState;
}

export interface SkipToQueuePositionResult {
  skippedItems: readonly QueueItem[];
  startedItem: QueueItem | null;
  state: GuildPlayerState;
}

export type GuildPlayerStateListener = (
  state: GuildPlayerState,
) => Promise<void> | void;

interface GuildPlayerEntry {
  operationChain: Promise<void>;
  player: Player | null;
  playerListenersAttached: boolean;
  queue: QueueService;
  state: GuildPlayerState;
}

const createInitialVoiceState = (): GuildPlayerVoiceState => ({
  channelId: null,
  isStageChannel: false,
  lastChannelId: null,
  selfDeaf: true,
  selfMute: false,
  shardId: null,
  status: "idle",
  suppressed: false,
});

const createInitialState = (
  guildId: string,
  defaultVolume: number,
): GuildPlayerState => ({
  autoplayMode: "off",
  currentItem: null,
  filterPreset: "off",
  guildId,
  history: [],
  lastError: null,
  nowPlayingMessageId: null,
  paused: false,
  playbackPositionMs: 0,
  queue: [],
  repeatMode: "off",
  textChannelId: null,
  voice: createInitialVoiceState(),
  volume: defaultVolume,
});

const getDisplayChannelId = (
  channel: VoiceBasedChannel,
  fallback: string | null | undefined,
): string | null => {
  return channel.id ?? fallback ?? null;
};

const isStageChannel = (channel: VoiceBasedChannel | null): boolean => {
  return channel?.type === ChannelType.GuildStageVoice;
};

const shouldAdvanceQueueOnTrackEnd = (reason: TrackEndReason): boolean => {
  return reason === "finished" || reason === "loadFailed";
};

export class GuildPlayerService {
  private readonly guildPlayers = new Map<string, GuildPlayerEntry>();

  private readonly inactivityTimers = new Map<string, NodeJS.Timeout>();

  private readonly stateListeners = new Set<GuildPlayerStateListener>();

  public constructor(
    private readonly env: AppEnv,
    private readonly lavalink: LavalinkService,
    private readonly settingsStore?: GuildSettingsStore,
  ) {}

  public onStateChange(listener: GuildPlayerStateListener): () => void {
    this.stateListeners.add(listener);

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public async connect(
    channel: VoiceBasedChannel,
    options: ConnectToVoiceChannelOptions = {},
  ): Promise<GuildPlayerState> {
    return this.runSerialized(channel.guild.id, async () => {
      const entry = this.getOrCreateEntry(channel.guild.id);
      const state = await this.connectEntry(entry, channel, options);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async destroy(guildId: string): Promise<void> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return;
    }

    await this.runSerialized(guildId, async () => {
      this.clearInactivityTimer(guildId);

      if (entry.player) {
        try {
          await entry.player.destroy();
        } catch (error) {
          logger.warn(
            { err: error, guildId },
            "Failed to destroy Lavalink player cleanly before teardown.",
          );
        }
      }

      await this.disconnectEntry(guildId, entry);
      this.guildPlayers.delete(guildId);

      logger.info({ guildId }, "Destroyed guild player state.");
    });
  }

  public async disconnect(guildId: string): Promise<GuildPlayerState | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      await this.disconnectEntry(guildId, entry);
      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public getPlayer(guildId: string): Player | undefined {
    return this.guildPlayers.get(guildId)?.player ?? this.lavalink.getPlayer(guildId);
  }

  public getQueue(guildId: string): QueueService | undefined {
    return this.guildPlayers.get(guildId)?.queue;
  }

  public getState(guildId: string): GuildPlayerState | undefined {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.snapshot(entry);
  }

  public setTextChannelId(
    guildId: string,
    textChannelId: string | null,
  ): GuildPlayerState {
    const entry = this.getOrCreateEntry(guildId);

    entry.state.textChannelId = textChannelId;
    return this.snapshot(entry);
  }

  public ensureQueue(guildId: string): QueueService {
    return this.getOrCreateEntry(guildId).queue;
  }

  public setNowPlayingMessageId(
    guildId: string,
    messageId: string | null,
  ): GuildPlayerState {
    const entry = this.getOrCreateEntry(guildId);

    entry.state.nowPlayingMessageId = messageId;
    return this.snapshot(entry);
  }

  public async enqueue(
    guildId: string,
    items: readonly QueueItem[],
    options: EnqueueTracksOptions = {},
  ): Promise<EnqueueTracksResult> {
    return this.runSerialized(guildId, async () => {
      const entry = this.getOrCreateEntry(guildId);
      const itemsToEnqueue = [...items];

      if (options.position === "next") {
        for (const item of [...itemsToEnqueue].reverse()) {
          entry.queue.addNext(item);
        }
      } else {
        entry.queue.addMany(itemsToEnqueue);
      }

      const startedItem = options.startIfIdle
        ? await this.startNextTrackIfIdle(entry)
        : null;

      const state = this.snapshot(entry);

      this.emitStateChange(entry);

      return {
        enqueuedItems: itemsToEnqueue,
        startedItem,
        state,
      };
    });
  }

  public async pause(guildId: string): Promise<GuildPlayerState | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      if (entry.player) {
        await entry.player.setPaused(true);
      }

      entry.state.paused = true;
      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async resume(guildId: string): Promise<GuildPlayerState | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      if (entry.player) {
        await entry.player.setPaused(false);
      }

      entry.state.paused = false;
      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async shuffle(guildId: string): Promise<GuildPlayerState | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      entry.queue.shuffle();
      this.syncStateFromQueue(entry);

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async clearQueue(
    guildId: string,
  ): Promise<ClearQueueResult | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      const clearedItems = entry.queue.clear();
      this.syncStateFromQueue(entry);

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return {
        clearedItems,
        state,
      };
    });
  }

  public async moveQueueItem(
    guildId: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<MoveQueueItemResult | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      const moved = entry.queue.move(fromIndex, toIndex);
      this.syncStateFromQueue(entry);

      const state = this.snapshot(entry);

      if (moved) {
        this.emitStateChange(entry);
      }

      return {
        moved,
        state,
      };
    });
  }

  public async removeFromQueue(
    guildId: string,
    index: number,
  ): Promise<RemoveQueueItemResult | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      const removedItem = entry.queue.remove(index);
      this.syncStateFromQueue(entry);

      const state = this.snapshot(entry);

      if (removedItem) {
        this.emitStateChange(entry);
      }

      return {
        removedItem,
        state,
      };
    });
  }

  public async cycleRepeatMode(
    guildId: string,
  ): Promise<GuildPlayerState | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      const nextMode =
        entry.state.repeatMode === "off"
          ? "track"
          : entry.state.repeatMode === "track"
            ? "queue"
            : "off";

      entry.queue.setRepeatMode(nextMode);
      this.syncStateFromQueue(entry);

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async setAutoplayMode(
    guildId: string,
    mode: GuildPlayerState["autoplayMode"],
  ): Promise<GuildPlayerState | undefined> {
    const entry = this.getOrCreateEntry(guildId);

    return this.runSerialized(guildId, async () => {
      entry.queue.setAutoplayMode(mode);
      this.syncStateFromQueue(entry);

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async setRepeatMode(
    guildId: string,
    mode: GuildPlayerState["repeatMode"],
  ): Promise<GuildPlayerState | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      entry.queue.setRepeatMode(mode);
      this.syncStateFromQueue(entry);

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async seek(
    guildId: string,
    positionMs: number,
  ): Promise<GuildPlayerState | null | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      const player = entry.player;
      const currentItem = entry.state.currentItem;

      if (
        !player ||
        !currentItem ||
        currentItem.track.isStream ||
        !currentItem.track.isSeekable
      ) {
        return null;
      }

      await player.seekTo(positionMs);

      entry.state.playbackPositionMs = positionMs;

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async setVolume(
    guildId: string,
    volume: number,
  ): Promise<GuildPlayerState | undefined> {
    const entry = this.getOrCreateEntry(guildId);

    return this.runSerialized(guildId, async () => {
      if (entry.player) {
        await entry.player.setGlobalVolume(volume);
      }

      entry.state.volume = volume;

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async applyFilterPreset(
    guildId: string,
    preset: FilterPreset,
  ): Promise<GuildPlayerState | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      const player = entry.player;

      if (player) {
        if (preset === "off") {
          await player.clearFilters();
        } else {
          await player.setFilters(getFiltersForPreset(preset));
        }
      }

      entry.state.filterPreset = preset;

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async skipToQueuePosition(
    guildId: string,
    index: number,
  ): Promise<SkipToQueuePositionResult | null | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      const queueItems = entry.queue.snapshot().items;

      if (!Number.isInteger(index) || index < 0 || index >= queueItems.length) {
        return null;
      }

      const skippedItems = [...queueItems.slice(0, index)];

      for (let currentIndex = index; currentIndex > 0; currentIndex -= 1) {
        entry.queue.remove(0);
      }

      const startedItem = await this.playNextTrack(entry, {
        forceAdvance: true,
        stopWhenEmpty: true,
      });

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return {
        skippedItems,
        startedItem,
        state,
      };
    });
  }

  public async skip(guildId: string): Promise<GuildPlayerState | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      await this.playNextTrack(entry, {
        forceAdvance: true,
        stopWhenEmpty: true,
      });

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async previous(guildId: string): Promise<GuildPlayerState | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      const player = entry.player;

      if (!player) {
        return this.snapshot(entry);
      }

      const previousItem = entry.queue.previous();

      if (!previousItem) {
        if (entry.state.currentItem && player.position > 5_000) {
          await player.seekTo(0);
        }

        entry.state.playbackPositionMs = 0;

        const state = this.snapshot(entry);

        this.emitStateChange(entry);
        return state;
      }

      await player.playTrack({ track: { encoded: previousItem.track.encoded } });

      entry.state.lastError = null;
      entry.state.paused = false;
      entry.state.playbackPositionMs = 0;
      this.syncStateFromQueue(entry);

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async stop(guildId: string): Promise<GuildPlayerState | undefined> {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return undefined;
    }

    return this.runSerialized(guildId, async () => {
      entry.queue.clear();
      entry.queue.setCurrentItem(null);

      if (entry.player) {
        await entry.player.stopTrack();
      }

      entry.state.paused = false;
      this.syncStateFromQueue(entry);

      const state = this.snapshot(entry);

      this.emitStateChange(entry);
      return state;
    });
  }

  public async handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
  ): Promise<void> {
    const entry = this.guildPlayers.get(newState.guild.id);

    if (!entry) {
      return;
    }

    await this.runSerialized(newState.guild.id, async () => {
      const currentEntry = this.guildPlayers.get(newState.guild.id);

      if (!currentEntry) {
        return;
      }

      if (!newState.channelId) {
        logger.warn(
          {
            guildId: newState.guild.id,
            oldChannelId: oldState.channelId,
          },
          "Bot left its voice channel.",
        );

        await this.disconnectEntry(newState.guild.id, currentEntry);
        this.emitStateChange(currentEntry);
        return;
      }

      currentEntry.state.voice.channelId = newState.channelId;
      currentEntry.state.voice.isStageChannel = isStageChannel(newState.channel);
      currentEntry.state.voice.lastChannelId = oldState.channelId;
      currentEntry.state.voice.selfDeaf =
        newState.selfDeaf ?? currentEntry.state.voice.selfDeaf;
      currentEntry.state.voice.selfMute =
        newState.selfMute ?? currentEntry.state.voice.selfMute;
      currentEntry.state.voice.shardId = newState.guild.shardId;
      currentEntry.state.voice.status = "connected";
      currentEntry.state.voice.suppressed =
        newState.suppress ?? currentEntry.state.voice.suppressed;

      if (oldState.channelId !== newState.channelId) {
        logger.info(
          {
            guildId: newState.guild.id,
            newChannelId: newState.channelId,
            oldChannelId: oldState.channelId,
          },
          "Bot voice channel changed.",
        );
      }

      if (isStageChannel(newState.channel) && newState.suppress) {
        const unsuppressed = await this.unsuppressStageChannel(newState.guild);

        currentEntry.state.voice.suppressed = !unsuppressed;
      }

      this.emitStateChange(currentEntry);
    });
  }

  public runSerialized<T>(
    guildId: string,
    operation: () => Promise<T> | T,
  ): Promise<T> {
    const entry = this.getOrCreateEntry(guildId);
    const run = entry.operationChain.then(operation, operation);

    entry.operationChain = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  public refreshInactivityTimeout(guildId: string): void {
    const entry = this.guildPlayers.get(guildId);

    if (!entry) {
      return;
    }

    this.refreshInactivityTimer(entry);
  }

  private attachPlayerListeners(entry: GuildPlayerEntry): void {
    const player = entry.player;

    if (!player || entry.playerListenersAttached) {
      return;
    }

    entry.playerListenersAttached = true;

    player.on("start", (event) => {
      const currentEntry = this.guildPlayers.get(entry.state.guildId);

      if (!currentEntry || currentEntry.player !== player) {
        return;
      }

      currentEntry.state.lastError = null;
      currentEntry.state.paused = false;
    currentEntry.state.playbackPositionMs = 0;

      logger.info(
        {
          guildId: entry.state.guildId,
          identifier: event.track.info.identifier,
          title: event.track.info.title,
        },
        "Lavalink player started a track.",
      );

      this.emitStateChange(currentEntry);
    });

    player.on("end", (event) => {
      const currentEntry = this.guildPlayers.get(entry.state.guildId);

      if (!currentEntry || currentEntry.player !== player) {
        return;
      }

      logger.info(
        {
          guildId: entry.state.guildId,
          reason: event.reason,
          title: event.track.info.title,
        },
        "Lavalink player ended a track.",
      );

      void this.handleTrackEnd(entry.state.guildId, player, event.reason);
    });

    player.on("closed", (event) => {
      const currentEntry = this.guildPlayers.get(entry.state.guildId);

      if (!currentEntry || currentEntry.player !== player) {
        return;
      }

      currentEntry.state.lastError = event.reason;

      logger.warn(
        {
          code: event.code,
          guildId: entry.state.guildId,
          reason: event.reason,
        },
        "Lavalink player websocket closed.",
      );

      this.emitStateChange(currentEntry);
    });

    player.on("exception", (event) => {
      const currentEntry = this.guildPlayers.get(entry.state.guildId);

      if (!currentEntry || currentEntry.player !== player) {
        return;
      }

      currentEntry.state.lastError = event.exception.message;

      logger.error(
        {
          exception: event.exception,
          guildId: entry.state.guildId,
        },
        "Lavalink player raised a track exception.",
      );

      this.emitStateChange(currentEntry);
    });

    player.on("update", () => {
      const currentEntry = this.guildPlayers.get(entry.state.guildId);

      if (!currentEntry || currentEntry.player !== player) {
        return;
      }

      currentEntry.state.paused = player.paused;
    currentEntry.state.playbackPositionMs = player.position;
      currentEntry.state.volume = player.volume;

      this.emitStateChange(currentEntry);
    });
  }

  private async connectEntry(
    entry: GuildPlayerEntry,
    channel: VoiceBasedChannel,
    options: ConnectToVoiceChannelOptions,
  ): Promise<GuildPlayerState> {
    if (!this.lavalink.hasAvailableNode()) {
      throw new Error("No Lavalink nodes are available to start playback.");
    }

    const selfDeaf = options.selfDeaf ?? true;
    const selfMute = options.selfMute ?? false;

    entry.state.textChannelId = getDisplayChannelId(
      channel,
      options.textChannelId ?? entry.state.textChannelId,
    );
    entry.state.voice = {
      channelId: channel.id,
      isStageChannel: isStageChannel(channel),
      lastChannelId: entry.state.voice.channelId,
      selfDeaf,
      selfMute,
      shardId: channel.guild.shardId,
      status: "connecting",
      suppressed: isStageChannel(channel),
    };

    const player = await this.lavalink.joinVoiceChannel({
      channelId: channel.id,
      deaf: selfDeaf,
      guildId: channel.guild.id,
      mute: selfMute,
      shardId: channel.guild.shardId,
    });

    if (entry.player !== player) {
      entry.player = player;
      entry.playerListenersAttached = false;
    }

    this.attachPlayerListeners(entry);

    if (player.volume !== entry.state.volume) {
      await player.setGlobalVolume(entry.state.volume);
    }

    if (entry.state.filterPreset === "off") {
      await player.clearFilters();
    } else {
      await player.setFilters(getFiltersForPreset(entry.state.filterPreset));
    }

    entry.state.paused = player.paused;
    entry.state.volume = player.volume;
    entry.state.voice.status = "connected";

    logger.info(
      {
        channelId: channel.id,
        guildId: channel.guild.id,
        isStageChannel: isStageChannel(channel),
        shardId: channel.guild.shardId,
      },
      "Connected guild player to voice channel.",
    );

    if (isStageChannel(channel)) {
      const unsuppressed = await this.unsuppressStageChannel(channel.guild);

      entry.state.voice.suppressed = !unsuppressed;
    } else {
      entry.state.voice.suppressed = false;
    }

    this.syncStateFromQueue(entry);
    return this.snapshot(entry);
  }

  private async disconnectEntry(
    guildId: string,
    entry: GuildPlayerEntry,
  ): Promise<void> {
    if (
      entry.player === null &&
      entry.state.voice.channelId === null &&
      !this.lavalink.getPlayer(guildId)
    ) {
      return;
    }

    this.clearInactivityTimer(guildId);
    entry.state.voice.status = "disconnecting";

    await this.lavalink.leaveVoiceChannel(guildId);

    entry.player = null;
    entry.playerListenersAttached = false;
    entry.queue.setCurrentItem(null);
    entry.state.lastError = null;
    entry.state.paused = false;
    entry.state.playbackPositionMs = 0;
    entry.state.voice = {
      ...createInitialVoiceState(),
      lastChannelId: entry.state.voice.channelId,
    };

    this.syncStateFromQueue(entry);

    logger.info({ guildId }, "Disconnected guild player from voice channel.");
  }

  private async handleTrackEnd(
    guildId: string,
    player: Player,
    reason: TrackEndReason,
  ): Promise<void> {
    await this.runSerialized(guildId, async () => {
      const entry = this.guildPlayers.get(guildId);

      if (!entry || entry.player !== player) {
        return;
      }

      if (!shouldAdvanceQueueOnTrackEnd(reason)) {
        if (reason === "stopped") {
          entry.state.paused = false;
          this.syncStateFromQueue(entry);
          this.emitStateChange(entry);
        }

        return;
      }

      try {
        const nextItem = await this.playNextTrack(entry, {
          forceAdvance: reason === "loadFailed",
        });

        if (!nextItem) {
          this.emitStateChange(entry);
        }
      } catch (error) {
        entry.state.lastError =
          error instanceof Error
            ? error.message
            : "Failed to continue playback with the next queued track.";

        logger.error(
          {
            err: error,
            guildId,
            reason,
          },
          "Failed to continue playback after track end.",
        );

        this.emitStateChange(entry);
      }
    });
  }

  private emitStateChange(entry: GuildPlayerEntry): void {
    this.refreshInactivityTimer(entry);

    if (this.stateListeners.size === 0) {
      return;
    }

    const state = this.snapshot(entry);

    for (const listener of this.stateListeners) {
      Promise.resolve(listener(state)).catch((error) => {
        logger.error(
          {
            err: error,
            guildId: entry.state.guildId,
          },
          "Guild player state listener failed.",
        );
      });
    }
  }

  private getOrCreateEntry(guildId: string): GuildPlayerEntry {
    const existingEntry = this.guildPlayers.get(guildId);

    if (existingEntry) {
      return existingEntry;
    }

    const persistedSettings = this.settingsStore?.getSnapshot(guildId).settings;
    const queueOptions =
      persistedSettings?.autoplayMode === undefined
        ? undefined
        : {
            autoplayMode: persistedSettings.autoplayMode,
          };

    const entry: GuildPlayerEntry = {
      operationChain: Promise.resolve(),
      player: null,
      playerListenersAttached: false,
      queue: new QueueService(queueOptions),
      state: {
        ...createInitialState(guildId, this.env.DEFAULT_VOLUME),
        autoplayMode: persistedSettings?.autoplayMode ?? "off",
        textChannelId: persistedSettings?.boundTextChannelId ?? null,
      },
    };

    this.guildPlayers.set(guildId, entry);
    return entry;
  }

  private snapshot(entry: GuildPlayerEntry): GuildPlayerState {
    this.syncStateFromQueue(entry);
    entry.state.playbackPositionMs = entry.player?.position ?? 0;

    return {
      ...entry.state,
      history: [...entry.state.history],
      queue: [...entry.state.queue],
      voice: { ...entry.state.voice },
    };
  }

  private syncStateFromQueue(entry: GuildPlayerEntry): void {
    const queueState = entry.queue.snapshot();

    entry.state.autoplayMode = queueState.autoplayMode;
    entry.state.currentItem = queueState.currentItem;
    entry.state.history = queueState.history;
    entry.state.queue = queueState.items;
    entry.state.repeatMode = queueState.repeatMode;
  }

  private async startNextTrackIfIdle(
    entry: GuildPlayerEntry,
  ): Promise<QueueItem | null> {
    if (entry.queue.snapshot().currentItem) {
      return null;
    }

    return this.playNextTrack(entry);
  }

  private async playNextTrack(
    entry: GuildPlayerEntry,
    options: {
      forceAdvance?: boolean;
      stopWhenEmpty?: boolean;
    } = {},
  ): Promise<QueueItem | null> {
    const player = entry.player;

    if (!player) {
      return null;
    }

    const nextItem =
      options.forceAdvance === undefined
        ? entry.queue.next()
        : entry.queue.next({ force: options.forceAdvance });

    if (!nextItem) {
      if (options.stopWhenEmpty) {
        await player.stopTrack();
      }

      entry.state.paused = false;
      entry.state.playbackPositionMs = 0;
      this.syncStateFromQueue(entry);
      return null;
    }

    await player.playTrack({ track: { encoded: nextItem.track.encoded } });

    entry.state.lastError = null;
    entry.state.paused = false;
    entry.state.playbackPositionMs = 0;
    this.syncStateFromQueue(entry);

    return nextItem;
  }

  private clearInactivityTimer(guildId: string): void {
    const timeout = this.inactivityTimers.get(guildId);

    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    this.inactivityTimers.delete(guildId);
  }

  private isTwentyFourSevenEnabled(guildId: string): boolean {
    return this.settingsStore?.getSnapshot(guildId).settings.twentyFourSevenEnabled ?? false;
  }

  private shouldScheduleInactivityTimeout(entry: GuildPlayerEntry): boolean {
    return (
      entry.state.voice.status === "connected" &&
      entry.state.voice.channelId !== null &&
      entry.state.currentItem === null &&
      entry.state.queue.length === 0 &&
      !this.isTwentyFourSevenEnabled(entry.state.guildId)
    );
  }

  private refreshInactivityTimer(entry: GuildPlayerEntry): void {
    if (!this.shouldScheduleInactivityTimeout(entry)) {
      this.clearInactivityTimer(entry.state.guildId);
      return;
    }

    if (this.inactivityTimers.has(entry.state.guildId)) {
      return;
    }

    const timeout = setTimeout(() => {
      void this.handleInactivityTimeout(entry.state.guildId);
    }, this.env.INACTIVITY_TIMEOUT_MS);

    timeout.unref?.();
    this.inactivityTimers.set(entry.state.guildId, timeout);
  }

  private async handleInactivityTimeout(guildId: string): Promise<void> {
    this.inactivityTimers.delete(guildId);

    await this.runSerialized(guildId, async () => {
      const entry = this.guildPlayers.get(guildId);

      if (!entry || !this.shouldScheduleInactivityTimeout(entry)) {
        return;
      }

      logger.info(
        {
          guildId,
          inactivityTimeoutMs: this.env.INACTIVITY_TIMEOUT_MS,
        },
        "Auto-disconnecting idle guild player after inactivity timeout.",
      );

      await this.disconnectEntry(guildId, entry);
      this.emitStateChange(entry);
    });
  }

  private async unsuppressStageChannel(guild: Guild): Promise<boolean> {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const voiceState = me.voice;

    if (!isStageChannel(voiceState.channel) || !voiceState.suppress) {
      return true;
    }

    try {
      await voiceState.setSuppressed(false);

      logger.info(
        {
          channelId: voiceState.channelId,
          guildId: guild.id,
        },
        "Requested stage channel unsuppress for bot user.",
      );

      return true;
    } catch (error) {
      logger.warn(
        {
          channelId: voiceState.channelId,
          err: error,
          guildId: guild.id,
        },
        "Failed to unsuppress bot in stage channel.",
      );

      return false;
    }
  }
}