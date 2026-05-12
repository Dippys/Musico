import { SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import { requireSameVoiceChannel } from "../../guards/requireSameVoiceChannel.js";
import {
  filterPresets,
  formatFilterPresetLabel,
  type FilterPreset,
} from "../../music/filters.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  requireControlledPlaybackAccess,
  respondToAutocomplete,
  respondToCommand,
  respondWithCommandError,
  syncDisplayChannelForInteraction,
} from "./shared.js";

const filterChoices = filterPresets.map((preset) => ({
  name: formatFilterPresetLabel(preset),
  value: preset,
}));

export const filterCommand: SlashCommand = {
  autocomplete: async (interaction) => {
    const focused = interaction.options.getFocused().toLowerCase();

    await respondToAutocomplete(
      interaction,
      filterChoices.filter((choice) => choice.value.includes(focused)),
    );
  },
  data: new SlashCommandBuilder()
    .setName("filter")
    .setDescription("Apply a playback filter preset.")
    .addStringOption((option) =>
      option
        .setName("preset")
        .setDescription("Filter preset to apply.")
        .setRequired(true)
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

    const preset = interaction.options.getString("preset", true);

    if (!filterPresets.includes(preset as FilterPreset)) {
      await respondWithCommandError(interaction, "Choose a valid filter preset.");
      return;
    }

    syncDisplayChannelForInteraction(interaction, context.music);

    const nextState = await context.music.guildPlayers.applyFilterPreset(
      voiceContext.guildId,
      preset as FilterPreset,
    );

    if (!nextState) {
      await respondWithCommandError(interaction, "I couldn't update the filter right now.");
      return;
    }

    await respondToCommand(
      interaction,
      createStatusView("Filter Updated", [
        `Filter preset is now ${formatFilterPresetLabel(nextState.filterPreset)}.`,
      ]),
    );
  },
};