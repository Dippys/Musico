import { SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import { requireSameVoiceChannel } from "../../guards/requireSameVoiceChannel.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  requireControlledPlaybackAccess,
  respondToCommand,
  respondWithCommandError,
} from "./shared.js";

export const leaveCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Disconnect from voice and clear the player state."),
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

    if (!state?.voice.channelId) {
      await respondWithCommandError(
        interaction,
        "I'm not connected to a voice channel right now.",
      );
      return;
    }

    try {
      await context.music.guildPlayers.destroy(voiceContext.guildId);
      await respondToCommand(
        interaction,
        createStatusView("Left Voice Channel", ["Cleared the queue."]),
      );
    } catch {
      await respondWithCommandError(
        interaction,
        "I couldn't leave the voice channel cleanly. Try again in a moment.",
      );
    }
  },
};