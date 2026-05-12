import { SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import type { SlashCommand } from "../../types/commands.js";
import { requireSameVoiceChannel } from "../../guards/requireSameVoiceChannel.js";

import {
  requireControlledPlaybackAccess,
  respondToCommand,
  respondWithCommandError,
  syncDisplayChannelForInteraction,
} from "./shared.js";

export const joinCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join your current voice channel."),
  async execute(interaction, context) {
    if (!(await requireControlledPlaybackAccess(interaction, context))) {
      return;
    }

    const voiceContext = await requireSameVoiceChannel(
      interaction,
      context.music.guildPlayers,
      {
        checkPermissions: true,
      },
    );

    if (!voiceContext) {
      return;
    }

    const displayChannelId = syncDisplayChannelForInteraction(
      interaction,
      context.music,
    );

    const existingState = context.music.guildPlayers.getState(voiceContext.guildId);

    if (
      existingState?.voice.channelId === voiceContext.voiceChannel.id &&
      existingState.voice.status === "connected"
    ) {
      await respondToCommand(
        interaction,
        createStatusView("Already Connected", [`<#${voiceContext.voiceChannel.id}>`], "neutral"),
      );
      return;
    }

    try {
      await context.music.guildPlayers.connect(voiceContext.voiceChannel, {
        textChannelId: displayChannelId,
      });

      await respondToCommand(
        interaction,
        createStatusView("Joined Voice Channel", [`<#${voiceContext.voiceChannel.id}>`]),
      );
    } catch {
      await respondWithCommandError(
        interaction,
        "I couldn't join your voice channel. Check my voice permissions and try again.",
      );
    }
  },
};