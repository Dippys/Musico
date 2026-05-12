import { MessageFlags } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { bindCommand } from "../../src/commands/admin/bind.js";
import { settingsCommand } from "../../src/commands/admin/settings.js";
import { autoplayCommand } from "../../src/commands/music/autoplay.js";

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
  ],
  LOG_LEVEL: "info",
} as const;

const createMusicContext = (overrides: object = {}) => ({
  displayMessages: {
    rebindGuildDisplay: vi.fn().mockResolvedValue(undefined),
    syncGuild: vi.fn().mockResolvedValue(undefined),
  },
  guildSettings: {
    getSnapshot: vi.fn().mockReturnValue({
      defaults: {
        autoplayMode: true,
        boundTextChannelId: true,
        djModeEnabled: true,
        twentyFourSevenEnabled: true,
      },
      guildId: "guild-1",
      hasStoredSettings: false,
      settings: {
        autoplayMode: "off",
        boundTextChannelId: null,
        djModeEnabled: false,
        twentyFourSevenEnabled: false,
      },
      storageState: "missing",
    }),
    update: vi.fn().mockResolvedValue({
      defaults: {
        autoplayMode: false,
        boundTextChannelId: true,
        djModeEnabled: true,
        twentyFourSevenEnabled: true,
      },
      guildId: "guild-1",
      hasStoredSettings: true,
      settings: {
        autoplayMode: "related",
        boundTextChannelId: null,
        djModeEnabled: false,
        twentyFourSevenEnabled: false,
      },
      storageState: "loaded",
    }),
  },
  guildPlayers: {
    getState: vi.fn().mockReturnValue({
      currentItem: {
        track: {
          isSeekable: true,
          isStream: false,
        },
      },
      filterPreset: "off",
      queue: [],
      repeatMode: "off",
      voice: {
        channelId: "voice-1",
      },
    }),
    setAutoplayMode: vi.fn().mockResolvedValue(undefined),
  },
  lavalink: {},
  trackResolver: {
    resolve: vi.fn(),
  },
  ...overrides,
});

describe("guild settings commands", () => {
  it("shows persisted defaults in /settings", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await settingsCommand.execute(
      {
        deferred: false,
        guildId: "guild-1",
        inCachedGuild: () => true,
        replied: false,
        reply,
      } as never,
      {
        commands: [settingsCommand],
        env: baseEnv,
        music: createMusicContext(),
      } as never,
    );

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );

    const payload = JSON.stringify(reply.mock.calls[0][0]);
    expect(payload).toContain("Autoplay: off (default)");
    expect(payload).toContain("Bound channel: not set (default)");
    expect(payload).toContain("Storage: missing");
  });

  it("persists autoplay updates and syncs runtime state", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const guildSettings = {
      getSnapshot: vi.fn().mockReturnValue({
        defaults: {
          autoplayMode: true,
          boundTextChannelId: true,
          djModeEnabled: true,
          twentyFourSevenEnabled: true,
        },
        guildId: "guild-1",
        hasStoredSettings: false,
        settings: {
          autoplayMode: "off",
          boundTextChannelId: null,
          djModeEnabled: false,
          twentyFourSevenEnabled: false,
        },
        storageState: "missing",
      }),
      update: vi.fn().mockResolvedValue({
        defaults: {
          autoplayMode: false,
          boundTextChannelId: true,
          djModeEnabled: true,
          twentyFourSevenEnabled: true,
        },
        guildId: "guild-1",
        hasStoredSettings: true,
        settings: {
          autoplayMode: "related",
          boundTextChannelId: null,
          djModeEnabled: false,
          twentyFourSevenEnabled: false,
        },
        storageState: "loaded",
      }),
    };
    const guildPlayers = {
      setAutoplayMode: vi.fn().mockResolvedValue(undefined),
    };

    await autoplayCommand.execute(
      {
        deferred: false,
        guildId: "guild-1",
        inCachedGuild: () => true,
        options: {
          getString: vi.fn().mockReturnValue(null),
        },
        replied: false,
        reply,
      } as never,
      {
        commands: [autoplayCommand],
        env: baseEnv,
        music: createMusicContext({
          guildPlayers,
          guildSettings,
        }),
      } as never,
    );

    expect(guildSettings.update).toHaveBeenCalledWith("guild-1", {
      autoplayMode: "related",
    });
    expect(guildPlayers.setAutoplayMode).toHaveBeenCalledWith("guild-1", "related");
    expect(JSON.stringify(reply.mock.calls[0][0])).toContain("Autoplay is now related.");
  });

  it("rebinds the display channel through /bind", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const displayMessages = {
      rebindGuildDisplay: vi.fn().mockResolvedValue(undefined),
    };
    const guildSettings = {
      update: vi.fn().mockResolvedValue(undefined),
    };

    await bindCommand.execute(
      {
        channelId: "text-1",
        deferred: false,
        guildId: "guild-1",
        inCachedGuild: () => true,
        options: {
          getBoolean: vi.fn().mockReturnValue(false),
          getChannel: vi.fn().mockReturnValue({ id: "text-99" }),
        },
        replied: false,
        reply,
      } as never,
      {
        commands: [bindCommand],
        env: baseEnv,
        music: createMusicContext({
          displayMessages,
          guildSettings,
        }),
      } as never,
    );

    expect(guildSettings.update).toHaveBeenCalledWith("guild-1", {
      boundTextChannelId: "text-99",
    });
    expect(displayMessages.rebindGuildDisplay).toHaveBeenCalledWith(
      "guild-1",
      "text-99",
    );
    expect(JSON.stringify(reply.mock.calls[0][0])).toContain(
      "Music updates are now bound to <#text-99>.",
    );
  });
});