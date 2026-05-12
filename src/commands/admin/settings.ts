import { SlashCommandBuilder } from "discord.js";

import {
  formatAutoplayModeLabel,
  formatRepeatModeLabel,
} from "../../display/shared.js";
import { createStatusView } from "../../display/statusView.js";
import { formatFilterPresetLabel } from "../../music/filters.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  formatBooleanState,
  formatSettingSource,
  respondToCommand,
  respondWithCommandError,
} from "../music/shared.js";

export const settingsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Show the current persisted guild music settings."),
  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) {
      await respondWithCommandError(interaction, "This command can only be used in a server.");
      return;
    }

    const snapshot = context.music.guildSettings.getSnapshot(interaction.guildId);
    const state = context.music.guildPlayers.getState(interaction.guildId);

    await respondToCommand(
      interaction,
      createStatusView("Guild Settings", [
        `Autoplay: ${formatAutoplayModeLabel(snapshot.settings.autoplayMode)} (${formatSettingSource(snapshot.defaults.autoplayMode)})`,
        `24/7 mode: ${formatBooleanState(snapshot.settings.twentyFourSevenEnabled)} (${formatSettingSource(snapshot.defaults.twentyFourSevenEnabled)})`,
        `DJ mode: ${formatBooleanState(snapshot.settings.djModeEnabled)} (${formatSettingSource(snapshot.defaults.djModeEnabled)})`,
        `Bound channel: ${snapshot.settings.boundTextChannelId ? `<#${snapshot.settings.boundTextChannelId}>` : "not set"} (${formatSettingSource(snapshot.defaults.boundTextChannelId)})`,
        `Storage: ${snapshot.storageState}`,
        state
          ? `Runtime: repeat ${formatRepeatModeLabel(state.repeatMode)}, filter ${formatFilterPresetLabel(state.filterPreset)}`
          : "Runtime: no active player state",
      ]),
    );
  },
};