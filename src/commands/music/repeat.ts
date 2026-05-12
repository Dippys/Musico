import { SlashCommandBuilder } from "discord.js";

import { formatRepeatModeLabel } from "../../display/shared.js";
import { createStatusView } from "../../display/statusView.js";
import { requireSameVoiceChannel } from "../../guards/requireSameVoiceChannel.js";
import { repeatModes, type RepeatMode } from "../../music/types.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  requireControlledPlaybackAccess,
  respondToAutocomplete,
  respondToCommand,
  respondWithCommandError,
  syncDisplayChannelForInteraction,
} from "./shared.js";

const repeatModeChoices = repeatModes.map((mode) => ({
  name: formatRepeatModeLabel(mode),
  value: mode,
}));

export const repeatCommand: SlashCommand = {
  autocomplete: async (interaction) => {
    const focused = interaction.options.getFocused().toLowerCase();

    await respondToAutocomplete(
      interaction,
      repeatModeChoices.filter((choice) => choice.value.includes(focused)),
    );
  },
  data: new SlashCommandBuilder()
    .setName("repeat")
    .setDescription("Set or cycle the repeat mode.")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Repeat mode to apply.")
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

    if (!state || (state.currentItem === null && state.queue.length === 0)) {
      await respondWithCommandError(interaction, "There is nothing queued to repeat right now.");
      return;
    }

    const mode = interaction.options.getString("mode");
    syncDisplayChannelForInteraction(interaction, context.music);

    let nextState;

    if (mode === null) {
      nextState = await context.music.guildPlayers.cycleRepeatMode(voiceContext.guildId);
    } else if (repeatModes.includes(mode as RepeatMode)) {
      nextState = await context.music.guildPlayers.setRepeatMode(
        voiceContext.guildId,
        mode as RepeatMode,
      );
    } else {
      await respondWithCommandError(interaction, "Choose a valid repeat mode.");
      return;
    }

    if (!nextState) {
      await respondWithCommandError(interaction, "I couldn't update repeat mode right now.");
      return;
    }

    await respondToCommand(
      interaction,
      createStatusView("Repeat Updated", [
        `Repeat mode is now ${formatRepeatModeLabel(nextState.repeatMode)}.`,
      ]),
    );
  },
};