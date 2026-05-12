import { SlashCommandBuilder } from "discord.js";

import { createStatusView } from "../../display/statusView.js";
import type { SlashCommand } from "../../types/commands.js";

import { respondToCommand } from "../music/shared.js";

const formatBytes = (value: number): string => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount.toFixed(amount >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatDuration = (totalMilliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(totalMilliseconds / 1_000));
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

export const statsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show runtime, process, and Lavalink node statistics."),
  async execute(interaction, context) {
    const health = context.music.lavalink.getHealthSnapshot();
    const memory = process.memoryUsage();
    const details = [
      `Guilds: ${interaction.client.guilds.cache.size}.`,
      `Gateway heartbeat: ${interaction.client.ws.ping}ms.`,
      `Process uptime: ${formatDuration(process.uptime() * 1_000)}.`,
      `Process memory: rss ${formatBytes(memory.rss)}, heap ${formatBytes(memory.heapUsed)} used / ${formatBytes(memory.heapTotal)} total.`,
      `Lavalink: ${health.connectedNodeCount}/${health.configuredNodeCount} nodes connected. Active players: ${health.activePlayerCount}. Failover: ${health.moveOnDisconnect ? "enabled" : "disabled"}.`,
      ...health.nodes.map((node) => {
        if (!node.stats) {
          return `${node.name}: ${node.state}${node.version ? `, Lavalink ${node.version}` : ""}, waiting for node stats.`;
        }

        return [
          `${node.name}: ${node.state}${node.version ? `, Lavalink ${node.version}` : ""}`,
          `${node.stats.playingPlayers}/${node.stats.players} playing`,
          `uptime ${formatDuration(node.stats.uptimeMs)}`,
          `memory ${formatBytes(node.stats.memoryUsed)} used`,
          `CPU ${(node.stats.cpuLoad * 100).toFixed(1)}%`,
          node.reconnects > 0 ? `reconnects ${node.reconnects}` : null,
        ]
          .filter((part): part is string => part !== null)
          .join(", ");
      }),
    ];

    await respondToCommand(interaction, createStatusView("Runtime Stats", details));
  },
};