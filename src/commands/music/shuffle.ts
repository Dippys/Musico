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

export const shuffleCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Shuffle the queued tracks."),
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

    if (!state || state.queue.length < 2) {
      await respondWithCommandError(
        interaction,
        "Add at least two queued tracks before shuffling.",
      );
      return;
    }

    syncDisplayChannelForInteraction(interaction, context.music);

    const shuffledState = await context.music.guildPlayers.shuffle(voiceContext.guildId);

    if (!shuffledState) {
      await respondWithCommandError(interaction, "I couldn't shuffle the queue right now.");
      return;
    }

    await respondToCommand(
      interaction,
      createStatusView(
        "Queue Shuffled",
        shuffledState.queue.slice(0, 3).map((item, index) => {
          return `${index + 1}. ${describeQueueItem(item)}`;
        }),
      ),
    );
  },
};