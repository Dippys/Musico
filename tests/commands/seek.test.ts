import { ChannelType } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { seekCommand } from "../../src/commands/music/seek.js";

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

const createGuild = () => ({
  members: {
    fetchMe: vi.fn().mockResolvedValue({ id: "bot-user" }),
    me: { id: "bot-user" },
  },
});

const createVoiceChannel = (channelId = "voice-1") => ({
  id: channelId,
  permissionsFor: vi.fn().mockReturnValue({
    has: vi.fn().mockReturnValue(true),
  }),
  type: ChannelType.GuildVoice,
});

describe("seek command", () => {
  it("opens the seek modal only when a seekable track is active", async () => {
    const showModal = vi.fn().mockResolvedValue(undefined);
    const voiceChannel = createVoiceChannel();

    await seekCommand.execute(
      {
        channelId: "text-1",
        guild: createGuild(),
        guildId: "guild-1",
        inCachedGuild: () => true,
        member: {
          voice: {
            channel: voiceChannel,
          },
        },
        options: {
          getString: vi.fn().mockReturnValue(null),
        },
        showModal,
      } as never,
      {
        commands: [seekCommand],
        env: baseEnv,
        music: {
          guildSettings: {
            getSnapshot: vi.fn().mockReturnValue({
              settings: {
                boundTextChannelId: null,
                djModeEnabled: false,
              },
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
              voice: {
                channelId: "voice-1",
              },
            }),
          },
        },
      } as never,
    );

    expect(showModal).toHaveBeenCalledTimes(1);
  });
});