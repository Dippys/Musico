import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type Client,
  type GuildTextBasedChannel,
} from "discord.js";

import { createNowPlayingView } from "../display/nowPlayingView.js";
import { toDisplayEdit, toDisplayMessage } from "../display/shared.js";
import { logger } from "../logging/logger.js";

import type { GuildPlayerService } from "./GuildPlayerService.js";
import type { GuildPlayerState } from "./types.js";

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

const shouldRenderMessage = (state: GuildPlayerState): boolean => {
  if (state.voice.channelId === null) {
    return false;
  }

  return state.currentItem !== null || state.queue.length > 0 || state.lastError !== null;
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

export class DisplayMessageController {
  private readonly refreshInterval: NodeJS.Timeout;

  private readonly syncChains = new Map<string, Promise<void>>();

  private readonly tickingGuildIds = new Set<string>();

  public constructor(
    private readonly client: Client,
    private readonly guildPlayers: GuildPlayerService,
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

  public async rebindGuildDisplay(
    guildId: string,
    textChannelId: string | null,
  ): Promise<GuildPlayerState> {
    const currentState = this.guildPlayers.getState(guildId);

    if (
      currentState?.textChannelId &&
      currentState.nowPlayingMessageId &&
      currentState.textChannelId !== textChannelId
    ) {
      const previousChannel = await this.fetchTextChannel(currentState.textChannelId);

      if (previousChannel) {
        await this.deleteTrackedMessage(previousChannel, currentState);
      } else {
        this.guildPlayers.setNowPlayingMessageId(guildId, null);
      }
    }

    const state = this.guildPlayers.setTextChannelId(guildId, textChannelId);
    await this.syncGuild(guildId);
    return state;
  }

  private async syncGuildInternal(guildId: string): Promise<void> {
    const state = this.guildPlayers.getState(guildId);

    if (!state?.textChannelId) {
      this.tickingGuildIds.delete(guildId);
      return;
    }

    const channel = await this.fetchTextChannel(state.textChannelId);

    if (!channel) {
      this.tickingGuildIds.delete(guildId);
      this.guildPlayers.setNowPlayingMessageId(guildId, null);
      return;
    }

    if (!shouldRenderMessage(state)) {
      this.tickingGuildIds.delete(guildId);
      await this.deleteTrackedMessage(channel, state);
      return;
    }

    const payload = createNowPlayingView(state);

    if (state.nowPlayingMessageId) {
      try {
        const message = await channel.messages.fetch(state.nowPlayingMessageId);
        await message.edit(toDisplayEdit(payload));
        return;
      } catch (error) {
        if (!isUnknownMessageError(error)) {
          logger.warn(
            {
              err: error,
              guildId,
              messageId: state.nowPlayingMessageId,
            },
            "Failed to refresh the tracked now playing message.",
          );
        }
      }
    }

    try {
      const message = await channel.send(toDisplayMessage(payload));
      this.guildPlayers.setNowPlayingMessageId(guildId, message.id);
    } catch (error) {
      logger.warn(
        {
          err: error,
          guildId,
          textChannelId: state.textChannelId,
        },
        "Failed to create the now playing message.",
      );
    }
  }

  private updateTickingState(state: GuildPlayerState): void {
    if (
      state.currentItem !== null &&
      !state.currentItem.track.isStream &&
      !state.paused &&
      state.textChannelId !== null &&
      state.voice.channelId !== null
    ) {
      this.tickingGuildIds.add(state.guildId);
      return;
    }

    this.tickingGuildIds.delete(state.guildId);
  }

  private async deleteTrackedMessage(
    channel: GuildTextBasedChannel,
    state: GuildPlayerState,
  ): Promise<void> {
    if (!state.nowPlayingMessageId) {
      return;
    }

    try {
      const message = await channel.messages.fetch(state.nowPlayingMessageId);
      await message.delete();
    } catch (error) {
      if (!isUnknownMessageError(error)) {
        logger.warn(
          {
            err: error,
            guildId: state.guildId,
            messageId: state.nowPlayingMessageId,
          },
          "Failed to delete the tracked now playing message.",
        );
      }
    }

    this.guildPlayers.setNowPlayingMessageId(state.guildId, null);
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
          "Failed to fetch the configured text channel for the now playing message.",
        );
      }

      return null;
    }
  }
}