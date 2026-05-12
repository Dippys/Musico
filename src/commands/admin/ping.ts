import { SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import type { SlashCommand } from "../../types/commands.js";

import { respondToCommand } from "../music/shared.js";

const formatDuration = (totalSeconds: number): string => {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [
    days > 0 ? `${days}d` : null,
    hours > 0 || days > 0 ? `${hours}h` : null,
    minutes > 0 || hours > 0 || days > 0 ? `${minutes}m` : null,
    `${seconds}s`,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
};

export const pingCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check whether the bot runtime is responsive."),
  async execute(interaction, context) {
    const roundTripMs = Date.now() - interaction.createdTimestamp;
    const health = context.music.lavalink.getHealthSnapshot();

    await respondToCommand(
      interaction,
      createStatusView("Runtime Health", [
        `Gateway heartbeat: ${interaction.client.ws.ping}ms.`,
        `Round trip: ${roundTripMs}ms.`,
        `Process uptime: ${formatDuration(Math.floor(process.uptime()))}.`,
        `Lavalink nodes: ${health.connectedNodeCount}/${health.configuredNodeCount} connected.${health.idealNodeName ? ` Ideal node: ${health.idealNodeName}.` : ""}`,
        `Active players: ${health.activePlayerCount}.`,
      ]),
    );
  },
};