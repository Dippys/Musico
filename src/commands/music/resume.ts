import { SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import { requireSameVoiceChannel } from "../../guards/requireSameVoiceChannel.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  describeQueueItem,
  requireControlledPlaybackAccess,
  respondToCommand,
  respondWithCommandError,
  syncDisplayChannelForInteraction,
} from "./shared.js";

export const resumeCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resume the current track."),
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

    if (!state?.currentItem) {
      await respondWithCommandError(interaction, "Nothing is playing right now.");
      return;
    }

    if (!state.paused) {
      await respondWithCommandError(interaction, "Playback is already running.");
      return;
    }

    try {
      await context.music.guildPlayers.resume(voiceContext.guildId);
      await respondToCommand(
        interaction,
        createStatusView("Resumed", [describeQueueItem(state.currentItem)]),
      );
    } catch {
      await respondWithCommandError(
        interaction,
        "I couldn't resume playback right now. Try again in a moment.",
      );
    }
  },
};