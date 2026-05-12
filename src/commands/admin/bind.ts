import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  respondToCommand,
  respondWithCommandError,
} from "../music/shared.js";

export const bindCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("bind")
    .setDescription("Bind now-playing updates to a guild text channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Text channel to bind music updates to.")
        .addChannelTypes(ChannelType.GuildAnnouncement, ChannelType.GuildText),
    )
    .addBooleanOption((option) =>
      option
        .setName("clear")
        .setDescription("Clear the existing bound channel and use the current channel instead."),
    ),
  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) {
      await respondWithCommandError(interaction, "This command can only be used in a server.");
      return;
    }

    const clearBinding = interaction.options.getBoolean("clear") ?? false;
    const selectedChannel = interaction.options.getChannel("channel");

    if (clearBinding && selectedChannel) {
      await respondWithCommandError(
        interaction,
        "Choose either a channel to bind or clear the binding, not both.",
      );
      return;
    }

    if (clearBinding) {
      await context.music.guildSettings.update(interaction.guildId, {
        boundTextChannelId: null,
      });

      const nextDisplayChannelId = interaction.channelId ?? null;

      await context.music.displayMessages.rebindGuildDisplay(
        interaction.guildId,
        nextDisplayChannelId,
      );

      await respondToCommand(
        interaction,
        createStatusView("Binding Cleared", [
          nextDisplayChannelId
            ? `Music updates will use <#${nextDisplayChannelId}> until a new binding is saved.`
            : "The stored channel binding has been cleared.",
        ]),
      );
      return;
    }

    const nextChannelId = selectedChannel?.id ?? interaction.channelId;

    if (!nextChannelId) {
      await respondWithCommandError(
        interaction,
        "Choose a text channel to bind music updates to.",
      );
      return;
    }

    await context.music.guildSettings.update(interaction.guildId, {
      boundTextChannelId: nextChannelId,
    });
    await context.music.displayMessages.rebindGuildDisplay(
      interaction.guildId,
      nextChannelId,
    );

    await respondToCommand(
      interaction,
      createStatusView("Bound Display Channel", [
        `Music updates are now bound to <#${nextChannelId}>.`,
      ]),
    );
  },
};