import {
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";

import { replyWithError } from "../bot/interactionReplies.js";
import type { AppEnv } from "../config/schema.js";
import type { GuildSettingsStore } from "../music/GuildSettingsStore.js";

type DjAccessInteraction =
  | ButtonInteraction
  | ChatInputCommandInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction;

const hasDjOverride = (member: GuildMember, ownerIds: readonly string[]): boolean => {
  return (
    ownerIds.includes(member.id) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member.permissions.has(PermissionFlagsBits.MoveMembers)
  );
};

export const requireDjAccess = async (
  interaction: DjAccessInteraction,
  env: AppEnv,
  guildSettings: GuildSettingsStore,
): Promise<boolean> => {
  if (!interaction.inCachedGuild()) {
    await replyWithError(interaction, "This command can only be used in a server.");
    return false;
  }

  const settings = guildSettings.getSnapshot(interaction.guildId).settings;

  if (!settings.djModeEnabled) {
    return true;
  }

  const member = interaction.member as GuildMember;

  if (hasDjOverride(member, env.BOT_OWNER_IDS)) {
    return true;
  }

  await replyWithError(
    interaction,
    "DJ mode is enabled here. Only members with Manage Guild, Manage Channels, or Move Members can control playback.",
  );

  return false;
};