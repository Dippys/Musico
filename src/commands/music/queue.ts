import { SlashCommandBuilder } from "discord.js";

import { createQueueView, DEFAULT_QUEUE_PAGE_SIZE } from "../../display/queueView.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  requireMusicChannelAccess,
  respondToAutocomplete,
  respondToCommand,
  respondWithCommandError,
  syncDisplayChannelForInteraction,
} from "./shared.js";

const createPageChoices = (
  totalItems: number,
  focusedValue: number | string,
) => {
  const normalizedFocused = String(focusedValue).trim();
  const pageCount = Math.max(1, Math.ceil(totalItems / DEFAULT_QUEUE_PAGE_SIZE));

  return Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    const startTrack = index * DEFAULT_QUEUE_PAGE_SIZE + 1;
    const endTrack = Math.min(totalItems, page * DEFAULT_QUEUE_PAGE_SIZE);

    return {
      name: `Page ${page} (${startTrack}-${endTrack || startTrack})`,
      value: page,
    };
  })
    .filter((choice) => {
      if (normalizedFocused.length === 0) {
        return true;
      }

      return choice.value.toString().startsWith(normalizedFocused);
    })
    .slice(0, 25);
};

export const queueCommand: SlashCommand = {
  autocomplete: async (interaction, context) => {
    if (!interaction.inCachedGuild()) {
      await respondToAutocomplete(interaction, []);
      return;
    }

    const state = context.music.guildPlayers.getState(interaction.guildId);

    await respondToAutocomplete(
      interaction,
      createPageChoices(state?.queue.length ?? 0, interaction.options.getFocused()),
    );
  },
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show the current queue and jump to a page.")
    .addIntegerOption((option) =>
      option
        .setName("page")
        .setDescription("Queue page to open.")
        .setMinValue(1)
        .setAutocomplete(true),
    ),
  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) {
      await respondWithCommandError(interaction, "This command can only be used in a server.");
      return;
    }

    if (!(await requireMusicChannelAccess(interaction, context.music))) {
      return;
    }

    const state = context.music.guildPlayers.getState(interaction.guildId);

    if (!state || (state.currentItem === null && state.queue.length === 0)) {
      await respondWithCommandError(interaction, "The queue is empty right now.");
      return;
    }

    const requestedPage = interaction.options.getInteger("page") ?? 1;
    const pageCount = Math.max(1, Math.ceil(state.queue.length / DEFAULT_QUEUE_PAGE_SIZE));

    if (requestedPage > pageCount) {
      await respondWithCommandError(
        interaction,
        `That queue page does not exist. Choose a page between 1 and ${pageCount}.`,
      );
      return;
    }

    syncDisplayChannelForInteraction(interaction, context.music);

    await respondToCommand(
      interaction,
      createQueueView(
        context.music.guildPlayers.getState(interaction.guildId) ?? state,
        {
          page: requestedPage - 1,
        },
      ),
    );
  },
};