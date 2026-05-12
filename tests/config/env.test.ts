import { describe, expect, it } from "vitest";

import { EnvValidationError, parseEnv } from "../../src/config/env.js";

const baseEnv: NodeJS.ProcessEnv = {
  DISCORD_TOKEN: "discord-token",
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_GUILD_ID: "234567890123456789",
  LAVALINK_NODES:
    '[{"name":"main","url":"localhost:2333","auth":"youshallnotpass","secure":false}]',
  DEFAULT_VOLUME: "100",
  INACTIVITY_TIMEOUT_MS: "300000",
  LOG_LEVEL: "info",
  BOT_OWNER_IDS: "123456789012345678,234567890123456789",
};

describe("parseEnv", () => {
  it("parses the expected Stage 01 configuration", () => {
    const env = parseEnv(baseEnv);

    expect(env.DEFAULT_VOLUME).toBe(100);
    expect(env.INACTIVITY_TIMEOUT_MS).toBe(300000);
    expect(env.BOT_OWNER_IDS).toEqual([
      "123456789012345678",
      "234567890123456789",
    ]);
    expect(env.LAVALINK_NODES[0]?.name).toBe("main");
  });

  it("fails fast when required variables are missing", () => {
    const act = (): void => {
      parseEnv({
        ...baseEnv,
        DISCORD_TOKEN: undefined,
      });
    };

    expect(act).toThrowError(EnvValidationError);
    expect(act).toThrowError(/DISCORD_TOKEN/);
  });

  it("rejects invalid lavalink JSON", () => {
    const act = (): void => {
      parseEnv({
        ...baseEnv,
        LAVALINK_NODES: "not-json",
      });
    };

    expect(act).toThrowError(/LAVALINK_NODES must be valid JSON/);
  });
});