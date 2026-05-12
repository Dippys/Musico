import { SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import { requireSameVoiceChannel } from "../../guards/requireSameVoiceChannel.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  requireControlledPlaybackAccess,
  respondToCommand,
  respondWithCommandError,
  syncDisplayChannelForInteraction,
} from "./shared.js";

export const clearCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Remove every queued track after the current item."),
  async execute(interaction, context) {
    if (!(await requireControlledPlaybackAccess(interaction, context))) {
      return;
    }

    const voiceContext = await requireSameVoiceChannel(
      interaction,
      context.music.guildPlayers,
    );

    if (!voiceContext) {
      return;
    }

    const state = context.music.guildPlayers.getState(voiceContext.guildId);

    if (!state || state.queue.length === 0) {
      await respondWithCommandError(interaction, "There are no queued tracks to clear.");
      return;
    }

    syncDisplayChannelForInteraction(interaction, context.music);

    const result = await context.music.guildPlayers.clearQueue(voiceContext.guildId);

    if (!result) {
      await respondWithCommandError(interaction, "I couldn't clear the queue right now.");
      return;
    }

    await respondToCommand(
      interaction,
      createStatusView("Queue Cleared", [
        `Removed ${result.clearedItems.length} queued track${
          result.clearedItems.length === 1 ? "" : "s"
        }.`,
      ]),
    );
  },
};