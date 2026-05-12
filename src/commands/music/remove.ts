import { SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import { formatQueueCount } from "../../display/shared.js";
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

export const removeCommand: SlashCommand = {
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
    .setName("remove")
    .setDescription("Remove a queued track by position.")
    .addIntegerOption((option) =>
      option
        .setName("position")
        .setDescription("Queued position to remove.")
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

    if (!state || state.queue.length === 0) {
      await respondWithCommandError(interaction, "There are no queued tracks to remove.");
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

    const result = await context.music.guildPlayers.removeFromQueue(
      voiceContext.guildId,
      position - 1,
    );

    if (!result?.removedItem) {
      await respondWithCommandError(interaction, "I couldn't remove that queued track.");
      return;
    }

    await respondToCommand(
      interaction,
      createStatusView("Removed From Queue", [
        `${position}. ${describeQueueItem(result.removedItem)}`,
        `Queue: ${formatQueueCount(result.state.queue.length)}`,
      ]),
    );
  },
};