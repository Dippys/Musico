import { MessageFlags } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { lyricsCommand } from "../../src/commands/music/lyrics.js";

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

const createPlayerState = () => ({
  autoplayMode: "off",
  currentItem: {
    id: "track-1",
    requestedAt: 1,
    requestedById: "user-1",
    track: {
      artist: "Rick Astley",
      artworkUrl: null,
      encoded: "encoded-1",
      identifier: "identifier-1",
      isSeekable: true,
      isStream: false,
      isrc: null,
      lengthMs: 213000,
      pluginInfo: {},
      positionMs: 0,
      sourceName: "youtube",
      title: "Never Gonna Give You Up",
      uri: "https://example.com/track-1",
    },
  },
  filterPreset: "off",
  guildId: "guild-1",
  history: [],
  lastError: null,
  nowPlayingMessageId: null,
  paused: false,
  playbackPositionMs: 15000,
  queue: [],
  repeatMode: "off",
  textChannelId: null,
  voice: {
    channelId: "voice-1",
    isStageChannel: false,
    lastChannelId: null,
    selfDeaf: true,
    selfMute: false,
    shardId: 0,
    status: "connected",
    suppressed: false,
  },
  volume: 100,
});

const createContext = (overrides: {
  guildPlayers?: object;
  lyrics?: object;
  lyricsMessages?: object;
} = {}) => ({
  commands: [lyricsCommand],
  env: baseEnv,
  music: {
    displayMessages: {} as never,
    guildSettings: {
      getSnapshot: vi.fn().mockReturnValue({
        settings: {
          boundTextChannelId: null,
        },
      }),
    },
    guildPlayers: {
      getState: vi.fn().mockReturnValue(createPlayerState()),
      setTextChannelId: vi.fn(),
      ...(overrides.guildPlayers ?? {}),
    },
    lavalink: {} as never,
    lyrics: {
      getLyrics: vi.fn().mockResolvedValue({
        albumName: null,
        artist: "Rick Astley",
        durationMs: 213000,
        instrumental: false,
        plainLyrics: "We're no strangers to love\nYou know the rules and so do I",
        provider: "lrclib",
        syncedLyrics: [
          {
            text: "We're no strangers to love",
            timeMs: 12000,
          },
          {
            text: "You know the rules and so do I",
            timeMs: 15500,
          },
        ],
        title: "Never Gonna Give You Up",
      }),
      ...(overrides.lyrics ?? {}),
    },
    lyricsMessages: {
      registerGuildMessage: vi.fn().mockResolvedValue(undefined),
      ...(overrides.lyricsMessages ?? {}),
    },
    trackResolver: {} as never,
  },
});

describe("lyricsCommand", () => {
  it("shows synced lyrics for the current track", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await lyricsCommand.execute(
      {
        channelId: "text-1",
        deferred: false,
        guildId: "guild-1",
        inCachedGuild: () => true,
        options: {
          getBoolean: vi.fn().mockReturnValue(false),
        },
        replied: false,
        reply,
      } as never,
      createContext() as never,
    );

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );

    const payload = JSON.stringify(reply.mock.calls[0][0]);
    expect(payload).toContain("## Lyrics");
    expect(payload).toContain("Never Gonna Give You Up");
    expect(payload).toContain("Synced lyrics");
    expect(payload).toContain("We're no strangers to love");
    expect(payload).toContain("Run `/lyrics live:true` to pin a live-updating lyrics panel in this channel.");
  });

  it("registers a tracked message when live mode is requested", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const fetchReply = vi.fn().mockResolvedValue({
      channelId: "text-1",
      id: "message-1",
    });
    const registerGuildMessage = vi.fn().mockResolvedValue(undefined);

    await lyricsCommand.execute(
      {
        channelId: "text-1",
        deferred: false,
        fetchReply,
        guildId: "guild-1",
        inCachedGuild: () => true,
        options: {
          getBoolean: vi.fn().mockReturnValue(true),
        },
        replied: false,
        reply,
      } as never,
      createContext({
        lyricsMessages: {
          registerGuildMessage,
        },
      }) as never,
    );

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );
    expect(fetchReply).toHaveBeenCalledTimes(1);
    expect(registerGuildMessage).toHaveBeenCalledWith(
      "guild-1",
      "text-1",
      "message-1",
    );

    const payload = JSON.stringify(reply.mock.calls[0][0]);
    expect(payload).toContain("## Live Lyrics");
    expect(payload).toContain("This panel refreshes about every 5 seconds while playback is active.");
  });
});