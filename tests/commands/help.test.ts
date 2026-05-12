import { MessageFlags } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { helpCommand } from "../../src/commands/admin/help.js";
import { pingCommand } from "../../src/commands/admin/ping.js";
import { playCommand } from "../../src/commands/music/play.js";

describe("helpCommand", () => {
  it("shows a grouped command overview", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await helpCommand.execute(
      {
        options: {
          getString: vi.fn().mockReturnValue(null),
        },
        reply,
      } as never,
      {
        commands: [helpCommand, pingCommand, playCommand],
        env: {
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
        },
      },
    );

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );

    const payload = JSON.stringify(reply.mock.calls[0][0]);
    expect(payload).toContain("Command Guide");
    expect(payload).toContain("/help [command] - Show a grouped command guide or inspect one command.");
    expect(payload).toContain("Playback");
    expect(payload).toContain("Server & info");
    expect(payload).toContain("/play <query> - Queue a track or playlist and start playback if idle.");
    expect(payload).toContain("/ping - Check whether the bot runtime is responsive.");
  });

  it("shows detailed help for a specific command", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await helpCommand.execute(
      {
        options: {
          getString: vi.fn().mockReturnValue("play"),
        },
        reply,
      } as never,
      {
        commands: [helpCommand, playCommand],
        env: {
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
        },
      } as never,
    );

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );

    const payload = JSON.stringify(reply.mock.calls[0][0]);
    expect(payload).toContain("## /play");
    expect(payload).toContain("Category: Playback");
    expect(payload).toContain("Usage: /play <query>");
    expect(payload).toContain("Options");
    expect(payload).toContain("query: A supported URL or a search query.");
  });

  it("autocompletes registered command names", async () => {
    const respond = vi.fn().mockResolvedValue(undefined);

    await helpCommand.autocomplete?.(
      {
        options: {
          getFocused: vi.fn().mockReturnValue("pl"),
        },
        respond,
      } as never,
      {
        commands: [helpCommand, pingCommand, playCommand],
      } as never,
    );

    expect(respond).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "play",
          value: "play",
        }),
      ]),
    );
  });
});