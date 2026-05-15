import { SlashCommandBuilder } from "discord.js";

import { deferReply } from "../../bot/interactionReplies.js";
import { createLyricsView } from "../../display/lyricsView.js";
import { toDisplayEdit, toDisplayReply } from "../../display/shared.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  requireMusicChannelAccess,
  respondToCommand,
  respondWithCommandError,
  syncDisplayChannelForInteraction,
} from "./shared.js";

export const lyricsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("Show lyrics for the current track.")
    .addBooleanOption((option) =>
      option
        .setName("live")
        .setDescription("Keep one lyrics panel synced while playback continues."),
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

    if (!state?.currentItem) {
      await respondWithCommandError(interaction, "Nothing is playing right now.");
      return;
    }

    await deferReply(interaction);

    syncDisplayChannelForInteraction(interaction, context.music);

    let lyrics = null;

    try {
      lyrics = await context.music.lyrics.getLyrics(state.currentItem.track);
    } catch {
      await respondWithCommandError(
        interaction,
        "Lyrics are unavailable right now. Please try again in a moment.",
      );
      return;
    }

    const live = interaction.options.getBoolean("live") ?? false;
    const payload = createLyricsView(state, lyrics, { live });

    if (!live) {
      await respondToCommand(interaction, payload);
      return;
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(toDisplayEdit(payload));
    } else {
      await interaction.reply(toDisplayReply(payload));
    }

    try {
      const reply = await interaction.fetchReply();

      await context.music.lyricsMessages.registerGuildMessage(
        interaction.guildId,
        reply.channelId,
        reply.id,
      );
    } catch {
      return;
    }
  },
};