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

export const skipCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip the current track."),
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

    try {
      const nextState = await context.music.guildPlayers.skip(voiceContext.guildId);

      if (!nextState?.currentItem) {
        await respondToCommand(
          interaction,
          createStatusView("Skipped", ["The queue is now empty."]),
        );
        return;
      }

      await respondToCommand(
        interaction,
        createStatusView("Skipped", [
          `Now playing: ${describeQueueItem(nextState.currentItem)}`,
        ]),
      );
    } catch {
      await respondWithCommandError(
        interaction,
        "I couldn't skip the current track right now. Try again in a moment.",
      );
    }
  },
};