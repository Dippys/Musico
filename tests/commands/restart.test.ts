import { describe, expect, it, vi } from "vitest";

import { restartCommand } from "../../src/commands/admin/restart.js";

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

describe("restartCommand", () => {
  it("rejects non-owners", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await restartCommand.execute(
      {
        client: {
          destroy: vi.fn(),
        },
        deferred: false,
        options: {},
        replied: false,
        reply,
        user: {
          id: "999999999999999999",
        },
      } as never,
      {
        commands: [restartCommand],
        env: baseEnv,
      } as never,
    );

    expect(reply).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(reply.mock.calls[0][0])).toContain(
      "Only configured bot owners can restart the bot.",
    );
  });

  it("acknowledges owners and exits the process", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const destroy = vi.fn().mockResolvedValue(undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      return undefined as never;
    }) as never);

    await restartCommand.execute(
      {
        client: {
          destroy,
        },
        deferred: false,
        options: {},
        replied: false,
        reply,
        user: {
          id: "123456789012345678",
        },
      } as never,
      {
        commands: [restartCommand],
        env: baseEnv,
      } as never,
    );

    expect(reply).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(reply.mock.calls[0][0])).toContain("Restarting Bot");
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });
});