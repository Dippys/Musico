import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type Client,
  type GuildTextBasedChannel,
} from "discord.js";

import { createLyricsView } from "../display/lyricsView.js";
import { toDisplayEdit } from "../display/shared.js";
import { logger } from "../logging/logger.js";

import type { GuildPlayerService } from "./GuildPlayerService.js";
import type { LyricsResult, LyricsService } from "./LyricsService.js";
import type { GuildPlayerState } from "./types.js";

interface TrackedLyricsMessage {
  channelId: string;
  messageId: string;
}

const isUnknownMessageError = (error: unknown): boolean => {
  return (
    error instanceof DiscordAPIError &&
    error.code === RESTJSONErrorCodes.UnknownMessage
  );
};

const isMissingChannelError = (error: unknown): boolean => {
  return (
    error instanceof DiscordAPIError &&
    (error.code === RESTJSONErrorCodes.UnknownChannel ||
      error.code === RESTJSONErrorCodes.MissingAccess)
  );
};

const isGuildTextChannel = (
  value: unknown,
): value is GuildTextBasedChannel => {
  return (
    value !== null &&
    typeof value === "object" &&
    "isTextBased" in value &&
    typeof value.isTextBased === "function" &&
    value.isTextBased() &&
    "send" in value &&
    typeof value.send === "function" &&
    "messages" in value
  );
};

export class LyricsMessageController {
  private readonly refreshInterval: NodeJS.Timeout;

  private readonly syncChains = new Map<string, Promise<void>>();

  private readonly tickingGuildIds = new Set<string>();

  private readonly trackedMessages = new Map<string, TrackedLyricsMessage>();

  public constructor(
    private readonly client: Client,
    private readonly guildPlayers: GuildPlayerService,
    private readonly lyrics: LyricsService,
  ) {
    this.guildPlayers.onStateChange((state) => {
      this.updateTickingState(state);
      return this.syncGuild(state.guildId);
    });

    this.refreshInterval = setInterval(() => {
      for (const guildId of this.tickingGuildIds) {
        void this.syncGuild(guildId);
      }
    }, 5_000);

    this.refreshInterval.unref();
  }

  public async registerGuildMessage(
    guildId: string,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    const previous = this.trackedMessages.get(guildId);

    if (
      previous &&
      (previous.channelId !== channelId || previous.messageId !== messageId)
    ) {
      const previousChannel = await this.fetchTextChannel(previous.channelId);

      if (previousChannel) {
        await this.deleteTrackedMessage(previousChannel, previous.messageId, guildId);
      }
    }

    this.trackedMessages.set(guildId, { channelId, messageId });

    const state = this.guildPlayers.getState(guildId);

    if (state) {
      this.updateTickingState(state);
    }

    await this.syncGuild(guildId);
  }

  public syncGuild(guildId: string): Promise<void> {
    const existingChain = this.syncChains.get(guildId) ?? Promise.resolve();
    const nextChain = existingChain.then(
      async () => {
        await this.syncGuildInternal(guildId);
      },
      async () => {
        await this.syncGuildInternal(guildId);
      },
    );

    this.syncChains.set(
      guildId,
      nextChain.finally(() => {
        if (this.syncChains.get(guildId) === nextChain) {
          this.syncChains.delete(guildId);
        }
      }),
    );

    return nextChain;
  }

  private async syncGuildInternal(guildId: string): Promise<void> {
    const trackedMessage = this.trackedMessages.get(guildId);

    if (!trackedMessage) {
      this.tickingGuildIds.delete(guildId);
      return;
    }

    const state = this.guildPlayers.getState(guildId);

    if (!state?.currentItem) {
      this.tickingGuildIds.delete(guildId);

      const channel = await this.fetchTextChannel(trackedMessage.channelId);

      if (channel) {
        await this.deleteTrackedMessage(channel, trackedMessage.messageId, guildId);
      }

      this.trackedMessages.delete(guildId);
      return;
    }

    const channel = await this.fetchTextChannel(trackedMessage.channelId);

    if (!channel) {
      this.tickingGuildIds.delete(guildId);
      this.trackedMessages.delete(guildId);
      return;
    }

    try {
      const message = await channel.messages.fetch(trackedMessage.messageId);
      const lyrics = await this.getLyricsForState(state);

      await message.edit(toDisplayEdit(createLyricsView(state, lyrics, { live: true })));
    } catch (error) {
      if (isUnknownMessageError(error)) {
        this.trackedMessages.delete(guildId);
        this.tickingGuildIds.delete(guildId);
        return;
      }

      logger.warn(
        {
          err: error,
          guildId,
          messageId: trackedMessage.messageId,
        },
        "Failed to refresh the tracked lyrics message.",
      );
    }
  }

  private updateTickingState(state: GuildPlayerState): void {
    if (
      this.trackedMessages.has(state.guildId) &&
      state.currentItem !== null &&
      !state.paused
    ) {
      this.tickingGuildIds.add(state.guildId);
      return;
    }

    this.tickingGuildIds.delete(state.guildId);
  }

  private async deleteTrackedMessage(
    channel: GuildTextBasedChannel,
    messageId: string,
    guildId: string,
  ): Promise<void> {
    try {
      const message = await channel.messages.fetch(messageId);
      await message.delete();
    } catch (error) {
      if (!isUnknownMessageError(error)) {
        logger.warn(
          {
            err: error,
            guildId,
            messageId,
          },
          "Failed to delete the tracked lyrics message.",
        );
      }
    }
  }

  private async fetchTextChannel(
    channelId: string,
  ): Promise<GuildTextBasedChannel | null> {
    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!isGuildTextChannel(channel)) {
        return null;
      }

      return channel;
    } catch (error) {
      if (!isMissingChannelError(error)) {
        logger.warn(
          {
            channelId,
            err: error,
          },
          "Failed to fetch the configured channel for tracked lyrics.",
        );
      }

      return null;
    }
  }

  private async getLyricsForState(
    state: GuildPlayerState,
  ): Promise<LyricsResult | null> {
    const currentItem = state.currentItem;

    if (!currentItem) {
      return null;
    }

    try {
      return await this.lyrics.getLyrics(currentItem.track);
    } catch (error) {
      logger.warn(
        {
          err: error,
          guildId: state.guildId,
          title: currentItem.track.title,
        },
        "Failed to resolve lyrics for the tracked lyrics message.",
      );

      return null;
    }
  }
}