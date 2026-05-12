import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  formatBooleanState,
  respondToCommand,
  respondWithCommandError,
} from "../music/shared.js";

export const djModeCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("djmode")
    .setDescription("Persist the guild DJ mode toggle.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Whether DJ mode should be enabled."),
    ),
  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) {
      await respondWithCommandError(interaction, "This command can only be used in a server.");
      return;
    }

    const current = context.music.guildSettings.getSnapshot(interaction.guildId);
    const nextEnabled =
      interaction.options.getBoolean("enabled") ?? !current.settings.djModeEnabled;

    const snapshot = await context.music.guildSettings.update(interaction.guildId, {
      djModeEnabled: nextEnabled,
    });

    await respondToCommand(
      interaction,
      createStatusView("DJ Mode Updated", [
        `DJ mode is now ${formatBooleanState(snapshot.settings.djModeEnabled)}.`,
        "This setting is saved for this guild.",
      ]),
    );
  },
};