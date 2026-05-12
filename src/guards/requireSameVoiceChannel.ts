import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";

import { replyWithError } from "../bot/interactionReplies.js";
import type { GuildPlayerService } from "../music/GuildPlayerService.js";

import {
  requireVoiceChannel,
  type RequireVoiceChannelOptions,
  type RequiredVoiceChannelContext,
} from "./requireVoiceChannel.js";

export const requireSameVoiceChannel = async (
  interaction:
    | ButtonInteraction
    | ChatInputCommandInteraction
    | ModalSubmitInteraction
    | StringSelectMenuInteraction,
  guildPlayers: GuildPlayerService,
  options: RequireVoiceChannelOptions = {},
): Promise<RequiredVoiceChannelContext | null> => {
  const voiceContext = await requireVoiceChannel(interaction, options);

  if (!voiceContext) {
    return null;
  }

  const botChannelId = guildPlayers.getState(voiceContext.guildId)?.voice.channelId;

  if (botChannelId && botChannelId !== voiceContext.voiceChannel.id) {
    await replyWithError(
      interaction,
      `You need to be in <#${botChannelId}> to use this command right now.`,
    );
    return null;
  }

  return voiceContext;
};