import { MessageFlags } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { pingCommand } from "../../src/commands/admin/ping.js";
import { statsCommand } from "../../src/commands/admin/stats.js";

const baseEnv = {
  BOT_OWNER_IDS: ["123456789012345678"],
  DEFAULT_VOLUME: 100,
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_GUILD_ID: "234567890123456789",
  DISCORD_TOKEN: "discord-token",
  INACTIVITY_TIMEOUT_MS: 300000,
  LAVALINK_NODES: [
    {
      auth: "youshallnotpass",
      name: "main",
      secure: false,
      url: "localhost:2333",
    },
    {
      auth: "youshallnotpass",
      name: "backup",
      secure: false,
      url: "localhost:2444",
    },
  ],
  LOG_LEVEL: "info",
} as const;

const createHealthSnapshot = () => ({
  activePlayerCount: 2,
  configuredNodeCount: 2,
  connectedNodeCount: 1,
  idealNodeName: "main",
  moveOnDisconnect: true,
  nodes: [
    {
      group: null,
      name: "main",
      reconnects: 0,
      state: "connected",
      stats: {
        cpuLoad: 0.123,
        frameDeficit: 0,
        frameNulled: 0,
        frameSent: 120,
        memoryAllocated: 512 * 1024 * 1024,
        memoryFree: 384 * 1024 * 1024,
        memoryUsed: 128 * 1024 * 1024,
        players: 2,
        playingPlayers: 1,
        uptimeMs: 600_000,
      },
      version: "4.0.8",
    },
    {
      group: null,
      name: "backup",
      reconnects: 2,
      state: "disconnected",
      stats: null,
      version: null,
    },
  ],
});

const createContext = () => ({
  commands: [pingCommand, statsCommand],
  env: baseEnv,
  music: {
    displayMessages: {} as never,
    guildPlayers: {} as never,
    guildSettings: {} as never,
    lavalink: {
      getHealthSnapshot: vi.fn().mockReturnValue(createHealthSnapshot()),
    },
    trackResolver: {} as never,
  },
});

const createInteraction = () => ({
  client: {
    guilds: {
      cache: {
        size: 7,
      },
    },
    ws: {
      ping: 42,
    },
  },
  createdTimestamp: Date.now() - 25,
  deferred: false,
  reply: vi.fn().mockResolvedValue(undefined),
  replied: false,
});

describe("admin health commands", () => {
  it("returns runtime health details from /ping", async () => {
    vi.spyOn(process, "uptime").mockReturnValue(125);

    try {
      const interaction = createInteraction();

      await pingCommand.execute(interaction as never, createContext() as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.any(Array),
          flags: MessageFlags.IsComponentsV2,
        }),
      );

      const payload = JSON.stringify(interaction.reply.mock.calls[0][0]);
      expect(payload).toContain("Runtime Health");
      expect(payload).toContain("Gateway heartbeat: 42ms.");
      expect(payload).toContain("Lavalink nodes: 1/2 connected.");
      expect(payload).toContain("Active players: 2.");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("returns per-node runtime statistics from /stats", async () => {
    vi.spyOn(process, "uptime").mockReturnValue(300);
    vi.spyOn(process, "memoryUsage").mockReturnValue({
      arrayBuffers: 0,
      external: 0,
      heapTotal: 64 * 1024 * 1024,
      heapUsed: 32 * 1024 * 1024,
      rss: 128 * 1024 * 1024,
    });

    try {
      const interaction = createInteraction();

      await statsCommand.execute(interaction as never, createContext() as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.any(Array),
          flags: MessageFlags.IsComponentsV2,
        }),
      );

      const payload = JSON.stringify(interaction.reply.mock.calls[0][0]);
      expect(payload).toContain("Runtime Stats");
      expect(payload).toContain("Guilds: 7.");
      expect(payload).toContain("Failover: enabled.");
      expect(payload).toContain("main: connected, Lavalink 4.0.8");
      expect(payload).toContain("backup: disconnected, waiting for node stats.");
    } finally {
      vi.restoreAllMocks();
    }
  });
});