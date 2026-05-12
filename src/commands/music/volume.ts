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

export const volumeCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set playback volume.")
    .addIntegerOption((option) =>
      option
        .setName("percent")
        .setDescription("Volume percentage from 0 to 200.")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(200),
    ),
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

    if (!state || (state.currentItem === null && state.queue.length === 0)) {
      await respondWithCommandError(interaction, "Nothing is playing right now.");
      return;
    }

    const volume = interaction.options.getInteger("percent", true);
    syncDisplayChannelForInteraction(interaction, context.music);

    const nextState = await context.music.guildPlayers.setVolume(
      voiceContext.guildId,
      volume,
    );

    if (!nextState) {
      await respondWithCommandError(interaction, "I couldn't update volume right now.");
      return;
    }

    await respondToCommand(
      interaction,
      createStatusView("Volume Updated", [`Playback volume is now ${nextState.volume}%.`]),
    );
  },
};