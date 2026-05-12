import { SlashCommandBuilder } from "discord.js";

import { formatQueueCount } from "../../display/shared.js";
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

export const moveCommand: SlashCommand = {
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
    .setName("move")
    .setDescription("Move a queued track to a new position.")
    .addIntegerOption((option) =>
      option
        .setName("from")
        .setDescription("Current queue position.")
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("to")
        .setDescription("New queue position.")
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

    if (!state || state.queue.length < 2) {
      await respondWithCommandError(
        interaction,
        "Add at least two queued tracks before moving one.",
      );
      return;
    }

    const fromPosition = interaction.options.getInteger("from", true);
    const toPosition = interaction.options.getInteger("to", true);

    if (fromPosition > state.queue.length || toPosition > state.queue.length) {
      await respondWithCommandError(
        interaction,
        `Choose queue positions between 1 and ${state.queue.length}.`,
      );
      return;
    }

    if (fromPosition === toPosition) {
      await respondWithCommandError(
        interaction,
        "Choose a different destination position for that track.",
      );
      return;
    }

    syncDisplayChannelForInteraction(interaction, context.music);

    const movedItem = state.queue[fromPosition - 1];
    const result = await context.music.guildPlayers.moveQueueItem(
      voiceContext.guildId,
      fromPosition - 1,
      toPosition - 1,
    );

    if (!result?.moved || !movedItem) {
      await respondWithCommandError(interaction, "I couldn't move that queued track.");
      return;
    }

    await respondToCommand(
      interaction,
      createStatusView("Moved Queue Item", [
        `${describeQueueItem(movedItem)} moved from ${fromPosition} to ${toPosition}.`,
        `Queue: ${formatQueueCount(result.state.queue.length)}`,
      ]),
    );
  },
};