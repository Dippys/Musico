import { SlashCommandBuilder } from "discord.js";

import { createNowPlayingView } from "../../display/nowPlayingView.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  requireMusicChannelAccess,
  respondToCommand,
  respondWithCommandError,
  syncDisplayChannelForInteraction,
} from "./shared.js";

export const nowPlayingCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Show the current playback state."),
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
      await respondWithCommandError(interaction, "Nothing is playing right now.");
      return;
    }

    syncDisplayChannelForInteraction(interaction, context.music);
    const displayState = context.music.guildPlayers.getState(interaction.guildId) ?? state;
    await context.music.displayMessages.syncGuild(interaction.guildId);
    await respondToCommand(interaction, createNowPlayingView(displayState));
  },
};