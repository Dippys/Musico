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

export const stopCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop playback and clear the queue."),
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
    syncDisplayChannelForInteraction(interaction, context.music);

    if (!state || (state.currentItem === null && state.queue.length === 0)) {
      await respondWithCommandError(
        interaction,
        "There is nothing to stop right now.",
      );
      return;
    }

    try {
      await context.music.guildPlayers.stop(voiceContext.guildId);
      await respondToCommand(
        interaction,
        createStatusView("Stopped Playback", ["Cleared the queue."]),
      );
    } catch {
      await respondWithCommandError(
        interaction,
        "I couldn't stop playback right now. Try again in a moment.",
      );
    }
  },
};