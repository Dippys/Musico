import { SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  formatBooleanState,
  requireControlledPlaybackAccess,
  respondToCommand,
  respondWithCommandError,
} from "./shared.js";

export const twentyFourSevenCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("247")
    .setDescription("Persist the guild 24/7 mode toggle.")
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Whether 24/7 mode should stay enabled."),
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
    const nextEnabled =
      interaction.options.getBoolean("enabled") ??
      !current.settings.twentyFourSevenEnabled;

    const snapshot = await context.music.guildSettings.update(guildId, {
      twentyFourSevenEnabled: nextEnabled,
    });

    context.music.guildPlayers.refreshInactivityTimeout(guildId);

    await respondToCommand(
      interaction,
      createStatusView("24/7 Mode Updated", [
        `24/7 mode is now ${formatBooleanState(snapshot.settings.twentyFourSevenEnabled)}.`,
        "This setting is saved for this guild.",
      ]),
    );
  },
};