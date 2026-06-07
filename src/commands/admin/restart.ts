import { SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  respondToCommand,
  respondWithCommandError,
} from "../music/shared.js";

export const restartCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("restart")
    .setDescription("Restart the bot process so Docker can relaunch it."),
  async execute(interaction, context) {
    if (!context.env.BOT_OWNER_IDS.includes(interaction.user.id)) {
      await respondWithCommandError(
        interaction,
        "Only configured bot owners can restart the bot.",
      );
      return;
    }

    await respondToCommand(
      interaction,
      createStatusView("Restarting Bot", [
        "The bot is shutting down now.",
        "Docker should relaunch it if the container restart policy is enabled.",
      ]),
    );

    await interaction.client.destroy();
    process.exit(0);
  },
};