import { SlashCommandBuilder } from "discord.js";

import { formatAutoplayModeLabel } from "../../display/shared.js";
import { createStatusView } from "../../display/statusView.js";
import { autoplayModes, type AutoplayMode } from "../../music/types.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  requireControlledPlaybackAccess,
  respondToAutocomplete,
  respondToCommand,
  respondWithCommandError,
} from "./shared.js";

const autoplayChoices = autoplayModes.map((mode) => ({
  name: formatAutoplayModeLabel(mode),
  value: mode,
}));

export const autoplayCommand: SlashCommand = {
  autocomplete: async (interaction) => {
    const focused = interaction.options.getFocused().toLowerCase();

    await respondToAutocomplete(
      interaction,
      autoplayChoices.filter((choice) => choice.value.includes(focused)),
    );
  },
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Persist the guild autoplay mode.")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Autoplay mode to set.")
        .setAutocomplete(true),
    ),
  async execute(interaction, context) {
    if (!(await requireControlledPlaybackAccess(interaction, context))) {
      return;
    }

    const guildId = interaction.guildId;

    if (!guildId) {
      await respondWithCommandError(interaction, "This command can only be used in a server.");
      return;
    }

    const current = context.music.guildSettings.getSnapshot(guildId);
    const requestedMode = interaction.options.getString("mode");
    const nextMode =
      requestedMode === null
        ? current.settings.autoplayMode === "off"
          ? "related"
          : "off"
        : requestedMode;

    if (!autoplayModes.includes(nextMode as AutoplayMode)) {
      await respondWithCommandError(interaction, "Choose a valid autoplay mode.");
      return;
    }

    const snapshot = await context.music.guildSettings.update(guildId, {
      autoplayMode: nextMode as AutoplayMode,
    });

    await context.music.guildPlayers.setAutoplayMode(guildId, snapshot.settings.autoplayMode);

    await respondToCommand(
      interaction,
      createStatusView("Autoplay Updated", [
        `Autoplay is now ${formatAutoplayModeLabel(snapshot.settings.autoplayMode)}.`,
        "This setting is saved for this guild.",
      ]),
    );
  },
};