import { SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import { requireSameVoiceChannel } from "../../guards/requireSameVoiceChannel.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  createQueuePositionChoices,
  describeQueueItem,
  requireControlledPlaybackAccess,
  respondToAutocomplete,
  respondToCommand,
  respondWithCommandError,
  syncDisplayChannelForInteraction,
} from "./shared.js";

export const skipToCommand: SlashCommand = {
  autocomplete: async (interaction, context) => {
    if (!interaction.inCachedGuild()) {
      await respondToAutocomplete(interaction, []);
      return;
    }

    const state = context.music.guildPlayers.getState(interaction.guildId);

    await respondToAutocomplete(
      interaction,
      createQueuePositionChoices(state?.queue ?? [], interaction.options.getFocused()),
    );
  },
  data: new SlashCommandBuilder()
    .setName("skipto")
    .setDescription("Skip directly to a queued track.")
    .addIntegerOption((option) =>
      option
        .setName("position")
        .setDescription("Queued position to start playing.")
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
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

    if (!state?.currentItem) {
      await respondWithCommandError(interaction, "Nothing is playing right now.");
      return;
    }

    if (state.queue.length === 0) {
      await respondWithCommandError(interaction, "There are no queued tracks to skip to.");
      return;
    }

    const position = interaction.options.getInteger("position", true);

    if (position > state.queue.length) {
      await respondWithCommandError(
        interaction,
        `Choose a queue position between 1 and ${state.queue.length}.`,
      );
      return;
    }

    syncDisplayChannelForInteraction(interaction, context.music);

    const result = await context.music.guildPlayers.skipToQueuePosition(
      voiceContext.guildId,
      position - 1,
    );

    if (!result?.startedItem) {
      await respondWithCommandError(interaction, "I couldn't skip to that track right now.");
      return;
    }

    await respondToCommand(
      interaction,
      createStatusView("Skipped Ahead", [
        `Now playing: ${describeQueueItem(result.startedItem)}`,
        `Removed ${result.skippedItems.length} queued track${
          result.skippedItems.length === 1 ? "" : "s"
        } before it.`,
      ]),
    );
  },
};