import {
  ChannelType,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type StringSelectMenuInteraction,
  type VoiceBasedChannel,
} from "discord.js";

import { replyWithError } from "../bot/interactionReplies.js";

export interface RequiredVoiceChannelContext {
  guildId: string;
  member: GuildMember;
  voiceChannel: VoiceBasedChannel;
}

export interface RequireVoiceChannelOptions {
  checkPermissions?: boolean;
}

type VoiceChannelInteraction =
  | ButtonInteraction
  | ChatInputCommandInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction;

export const requireVoiceChannel = async (
  interaction: VoiceChannelInteraction,
  options: RequireVoiceChannelOptions = {},
): Promise<RequiredVoiceChannelContext | null> => {
  if (!interaction.inCachedGuild()) {
    await replyWithError(interaction, "This command can only be used in a server.");
    return null;
  }

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await replyWithError(
      interaction,
      "Join a voice channel before using this command.",
    );
    return null;
  }

  if (options.checkPermissions) {
    const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
    const permissions = voiceChannel.permissionsFor(me);

    if (!permissions?.has(PermissionFlagsBits.Connect)) {
      await replyWithError(
        interaction,
        "I need permission to connect to your voice channel before I can do that.",
      );
      return null;
    }

    if (
      voiceChannel.type !== ChannelType.GuildStageVoice &&
      !permissions.has(PermissionFlagsBits.Speak)
    ) {
      await replyWithError(
        interaction,
        "I need permission to speak in your voice channel before I can do that.",
      );
      return null;
    }
  }

  return {
    guildId: interaction.guildId,
    member,
    voiceChannel,
  };
};