import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";

import { replyWithError } from "../bot/interactionReplies.js";
import type { GuildSettingsStore } from "../music/GuildSettingsStore.js";

type BoundChannelInteraction =
  | ButtonInteraction
  | ChatInputCommandInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction;

export const requireBoundChannel = async (
  interaction: BoundChannelInteraction,
  guildSettings: GuildSettingsStore,
): Promise<boolean> => {
  if (!interaction.inCachedGuild()) {
    await replyWithError(interaction, "This command can only be used in a server.");
    return false;
  }

  const boundTextChannelId = guildSettings.getSnapshot(interaction.guildId).settings.boundTextChannelId;

  if (!boundTextChannelId || interaction.channelId === boundTextChannelId) {
    return true;
  }

  await replyWithError(
    interaction,
    `Music controls are bound to <#${boundTextChannelId}> in this server.`,
  );

  return false;
};