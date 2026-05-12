import { ChannelType, MessageFlags } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { playCommand } from "../../src/commands/music/play.js";
import { queueCommand } from "../../src/commands/music/queue.js";
import { skipCommand } from "../../src/commands/music/skip.js";

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

const createVoiceChannel = (channelId: string) => ({
  id: channelId,
  permissionsFor: vi.fn().mockReturnValue({
    has: vi.fn().mockReturnValue(true),
  }),
  type: ChannelType.GuildVoice,
});

const createGuild = () => ({
  members: {
    fetchMe: vi.fn().mockResolvedValue({ id: "bot-user" }),
    me: { id: "bot-user" },
  },
});

const createGuildSettingsSnapshot = (overrides: object = {}) => ({
  settings: {
    boundTextChannelId: null,
    djModeEnabled: false,
    ...overrides,
  },
});

const createContext = (
  musicOverrides: {
    guildPlayers?: object;
    guildSettings?: object;
    lavalink?: object;
    trackResolver?: object;
  } = {},
) => ({
  commands: [playCommand],
  env: baseEnv,
  music: {
    guildSettings: {
      getSnapshot: vi.fn().mockReturnValue(createGuildSettingsSnapshot()),
      ...(musicOverrides.guildSettings ?? {}),
    },
    guildPlayers: {
      connect: vi.fn().mockResolvedValue(undefined),
      enqueue: vi.fn().mockResolvedValue({
        enqueuedItems: [],
        startedItem: null,
        state: {
          currentItem: null,
          queue: [],
        },
      }),
      getState: vi.fn().mockReturnValue(undefined),
      setTextChannelId: vi.fn(),
      skip: vi.fn().mockResolvedValue(undefined),
      ...(musicOverrides.guildPlayers ?? {}),
    },
    lavalink: {
      ...(musicOverrides.lavalink ?? {}),
    },
    trackResolver: {
      resolve: vi.fn(),
      ...(musicOverrides.trackResolver ?? {}),
    },
  },
});

describe("music commands", () => {
  it("returns a public error when /play is used outside a voice channel", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await playCommand.execute(
      {
        deferred: false,
        guild: createGuild(),
        guildId: "guild-1",
        inCachedGuild: () => true,
        member: {
          voice: {
            channel: null,
          },
        },
        options: {
          getString: vi.fn().mockReturnValue("query"),
        },
        replied: false,
        reply,
      } as never,
      createContext({}) as never,
    );

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );
    expect(JSON.stringify(reply.mock.calls[0][0])).toContain(
      "Join a voice channel before using this command.",
    );
  });

  it("returns a search-result select menu for /play when multiple matches are found", async () => {
    const editReply = vi.fn().mockResolvedValue(undefined);
    const reply = vi.fn().mockResolvedValue(undefined);
    const setTextChannelId = vi.fn();
    const voiceChannel = createVoiceChannel("voice-1");
    const enqueue = vi.fn().mockResolvedValue({
      enqueuedItems: [
        {
          id: "track-1",
          requestedAt: 1,
          requestedById: "user-1",
          track: {
            artist: "Artist 1",
            artworkUrl: null,
            encoded: "encoded-1",
            identifier: "identifier-1",
            isSeekable: true,
            isStream: false,
            isrc: null,
            lengthMs: 180000,
            pluginInfo: {},
            positionMs: 0,
            sourceName: "youtube",
            title: "Track 1",
            uri: "https://example.com/1",
          },
        },
      ],
      startedItem: {
        id: "track-1",
        requestedAt: 1,
        requestedById: "user-1",
        track: {
          artist: "Artist 1",
          artworkUrl: null,
          encoded: "encoded-1",
          identifier: "identifier-1",
          isSeekable: true,
          isStream: false,
          isrc: null,
          lengthMs: 180000,
          pluginInfo: {},
          positionMs: 0,
          sourceName: "youtube",
          title: "Track 1",
          uri: "https://example.com/1",
        },
      },
      state: {
        currentItem: null,
        queue: [],
      },
    });
    const trackResolver = {
      resolve: vi.fn().mockResolvedValue({
        items: [
          {
            id: "track-1",
            requestedAt: 1,
            requestedById: "user-1",
            track: {
              artist: "Artist 1",
              artworkUrl: null,
              encoded: "encoded-1",
              identifier: "identifier-1",
              isSeekable: true,
              isStream: false,
              isrc: null,
              lengthMs: 180000,
              pluginInfo: {},
              positionMs: 0,
              sourceName: "youtube",
              title: "Track 1",
              uri: "https://example.com/1",
            },
          },
          {
            id: "track-2",
            requestedAt: 2,
            requestedById: "user-1",
            track: {
              artist: "Artist 2",
              artworkUrl: null,
              encoded: "encoded-2",
              identifier: "identifier-2",
              isSeekable: true,
              isStream: false,
              isrc: null,
              lengthMs: 180000,
              pluginInfo: {},
              positionMs: 0,
              sourceName: "youtube",
              title: "Track 2",
              uri: "https://example.com/2",
            },
          },
        ],
        source: "search",
      }),
    };
    const guildPlayers = {
      connect: vi.fn().mockResolvedValue(undefined),
      enqueue,
      getState: vi.fn().mockReturnValue(undefined),
      setTextChannelId,
    };
    const interaction = {
      channelId: "text-1",
      deferred: false,
      deferReply: vi.fn().mockImplementation(async () => {
        interaction.deferred = true;
      }),
      editReply,
      guild: createGuild(),
      guildId: "guild-1",
      inCachedGuild: () => true,
      member: {
        voice: {
          channel: voiceChannel,
        },
      },
      options: {
        getString: vi.fn().mockReturnValue("query"),
      },
      replied: false,
      reply,
      user: {
        id: "user-1",
      },
    };

    await playCommand.execute(
      interaction as never,
      {
        commands: [playCommand],
        env: baseEnv,
        music: {
          guildPlayers,
          guildSettings: {
            getSnapshot: vi.fn().mockReturnValue(createGuildSettingsSnapshot()),
          },
          lavalink: {},
          trackResolver,
        },
      } as never,
    );

    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(setTextChannelId).toHaveBeenCalledWith("guild-1", "text-1");
    expect(enqueue).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );
    const payload = JSON.stringify(editReply.mock.calls[0][0]);
    expect(payload).toContain("Choose A Search Result");
    expect(payload).toContain("Track 1");
    expect(payload).toContain("Track 2");
  });

  it("rejects shared playback commands when the user is in a different voice channel", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const userChannel = createVoiceChannel("voice-1");

    await skipCommand.execute(
      {
        deferred: false,
        guild: createGuild(),
        guildId: "guild-1",
        inCachedGuild: () => true,
        member: {
          voice: {
            channel: userChannel,
          },
        },
        replied: false,
        reply,
      } as never,
      {
        commands: [skipCommand],
        env: baseEnv,
        music: {
          guildPlayers: {
            getState: vi.fn().mockReturnValue({
              currentItem: {
                id: "track-1",
              },
              voice: {
                channelId: "voice-2",
              },
            }),
          },
          guildSettings: {
            getSnapshot: vi.fn().mockReturnValue(createGuildSettingsSnapshot()),
          },
          lavalink: {},
          trackResolver: {
            resolve: vi.fn(),
          },
        },
      } as never,
    );

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );
    expect(JSON.stringify(reply.mock.calls[0][0])).toContain(
      "You need to be in <#voice-2> to use this command right now.",
    );
  });

  it("blocks /play for non-DJ members when DJ mode is enabled", async () => {
    const interaction = {
      channelId: "text-1",
      deferred: false,
      deferReply: vi.fn().mockImplementation(async () => {
        interaction.deferred = true;
      }),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      guild: createGuild(),
      guildId: "guild-1",
      inCachedGuild: () => true,
      member: {
        id: "user-1",
        permissions: {
          has: vi.fn().mockReturnValue(false),
        },
        voice: {
          channel: createVoiceChannel("voice-1"),
        },
      },
      options: {
        getString: vi.fn().mockReturnValue("query"),
      },
      replied: false,
      reply: vi.fn().mockResolvedValue(undefined),
      user: {
        id: "user-1",
      },
    };

    await playCommand.execute(
      interaction as never,
      createContext({
        guildSettings: {
          getSnapshot: vi.fn().mockReturnValue(
            createGuildSettingsSnapshot({
              djModeEnabled: true,
            }),
          ),
        },
      }) as never,
    );

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );
    expect(JSON.stringify(interaction.reply.mock.calls[0][0])).toContain(
      "DJ mode is enabled here.",
    );
  });

  it("blocks /queue outside the bound text channel", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await queueCommand.execute(
      {
        channelId: "text-general",
        deferred: false,
        guildId: "guild-1",
        inCachedGuild: () => true,
        options: {
          getInteger: vi.fn().mockReturnValue(null),
        },
        replied: false,
        reply,
      } as never,
      {
        commands: [queueCommand],
        env: baseEnv,
        music: {
          guildPlayers: {
            getState: vi.fn(),
            setTextChannelId: vi.fn(),
          },
          guildSettings: {
            getSnapshot: vi.fn().mockReturnValue(
              createGuildSettingsSnapshot({
                boundTextChannelId: "text-music",
              }),
            ),
          },
          lavalink: {},
          trackResolver: {
            resolve: vi.fn(),
          },
        },
      } as never,
    );

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );
    expect(JSON.stringify(reply.mock.calls[0][0])).toContain(
      "Music controls are bound to <#text-music> in this server.",
    );
  });
});