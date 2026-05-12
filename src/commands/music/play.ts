import { SlashCommandBuilder } from "discord.js";

import { deferReply } from "../../bot/interactionReplies.js";
import { createSearchResultSelectionView } from "../../components/selects/searchResultSelect.js";
import { requireSameVoiceChannel } from "../../guards/requireSameVoiceChannel.js";
import { logger } from "../../logging/logger.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  createQueueResultView,
  getPlaybackErrorMessage,
  requireControlledPlaybackAccess,
  respondToCommand,
  respondWithCommandError,
  syncDisplayChannelForInteraction,
} from "./shared.js";

export const playCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Queue a track or playlist and start playback if idle.")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("A supported URL or a search query.")
        .setRequired(true),
    ),
  async execute(interaction, context) {
    if (!(await requireControlledPlaybackAccess(interaction, context))) {
      return;
    }

    const voiceContext = await requireSameVoiceChannel(
      interaction,
      context.music.guildPlayers,
      {
        checkPermissions: true,
      },
    );

    if (!voiceContext) {
      return;
    }

    await deferReply(interaction);

    try {
      const query = interaction.options.getString("query", true);
      const displayChannelId = syncDisplayChannelForInteraction(
        interaction,
        context.music,
      );
      const resolution = await context.music.trackResolver.resolve(
        query,
        {
          requestedById: interaction.user.id,
        },
      );

      if (resolution.source === "search" && resolution.items.length > 1) {
        await respondToCommand(
          interaction,
          createSearchResultSelectionView({
            action: "queued",
            guildId: voiceContext.guildId,
            items: resolution.items,
            query,
            requestedById: interaction.user.id,
          }),
        );
        return;
      }

      const itemsToQueue = resolution.items;

      if (itemsToQueue.length === 0) {
        await respondWithCommandError(interaction, "No tracks matched that query.");
        return;
      }

      const existingState = context.music.guildPlayers.getState(voiceContext.guildId);

      if (
        existingState?.voice.channelId !== voiceContext.voiceChannel.id ||
        existingState.voice.status !== "connected"
      ) {
        await context.music.guildPlayers.connect(voiceContext.voiceChannel, {
          textChannelId: displayChannelId,
        });
      }

      const result = await context.music.guildPlayers.enqueue(
        voiceContext.guildId,
        itemsToQueue,
        {
          startIfIdle: true,
        },
      );

      await respondToCommand(
        interaction,
        createQueueResultView(
          result.enqueuedItems,
          result.startedItem,
          result.state,
          {
            action: "queued",
          },
        ),
      );
    } catch (error) {
      logger.error(
        {
          command: "play",
          err: error,
          guildId: interaction.guildId,
          userId: interaction.user.id,
        },
        "Failed to start playback.",
      );

      await respondWithCommandError(
        interaction,
        getPlaybackErrorMessage(
          error,
          "I couldn't start playback right now. Try again in a moment.",
        ),
      );
    }
  },
};