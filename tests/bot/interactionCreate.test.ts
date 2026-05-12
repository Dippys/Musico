import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { createInteractionCreateHandler } from "../../src/bot/events/interactionCreate.js";
import type { BotRegistry } from "../../src/bot/registry.js";
import type { BotRuntimeContext } from "../../src/bot/runtimeContext.js";
import type { SlashCommand } from "../../src/types/commands.js";

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

const createRegistry = (commands: readonly SlashCommand[]): BotRegistry => ({
  buttonHandlers: new Map(),
  commands,
  commandsByName: new Map(
    commands.map((command) => [command.data.toJSON().name, command] as const),
  ),
  modalHandlers: new Map(),
  stringSelectHandlers: new Map(),
});

const createContext = (registry: BotRegistry): BotRuntimeContext => ({
  env: baseEnv,
  music: {
    displayMessages: {} as never,
    guildSettings: {
      getSnapshot: vi.fn().mockReturnValue({
        settings: {
          boundTextChannelId: null,
        },
      }),
    } as never,
    guildPlayers: {} as never,
    lavalink: {} as never,
    trackResolver: {} as never,
  },
  registry,
});

const createBaseInteraction = () => ({
  guildId: "234567890123456789",
  isAutocomplete: () => false,
  isButton: () => false,
  isChatInputCommand: () => false,
  isModalSubmit: () => false,
  isRepliable: () => false,
  isStringSelectMenu: () => false,
  type: 2,
  user: { id: "123456789012345678" },
});

describe("createInteractionCreateHandler", () => {
  it("replies cleanly when a slash command is unknown", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const followUp = vi.fn().mockResolvedValue(undefined);
    const handler = createInteractionCreateHandler(createContext(createRegistry([])));
    const interaction = {
      ...createBaseInteraction(),
      commandName: "missing",
      deferred: false,
      followUp,
      replied: false,
      reply,
      isChatInputCommand: () => true,
      isRepliable: () => true,
    };

    await handler(interaction as never);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );
    expect(JSON.stringify(reply.mock.calls[0][0])).toContain(
      "That interaction is not available right now. Please try again.",
    );
    expect(followUp).not.toHaveBeenCalled();
  });

  it("surfaces command execution failures without crashing", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const command: SlashCommand = {
      data: new SlashCommandBuilder()
        .setName("explode")
        .setDescription("Throw a runtime error."),
      execute: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const handler = createInteractionCreateHandler(
      createContext(createRegistry([command])),
    );
    const interaction = {
      ...createBaseInteraction(),
      commandName: "explode",
      deferred: false,
      followUp: vi.fn().mockResolvedValue(undefined),
      replied: false,
      reply,
      isChatInputCommand: () => true,
      isRepliable: () => true,
    };

    await handler(interaction as never);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2,
      }),
    );
    expect(JSON.stringify(reply.mock.calls[0][0])).toContain(
      "Something went wrong while handling that interaction.",
    );
  });

  it("returns an empty autocomplete response for unknown handlers", async () => {
    const respond = vi.fn().mockResolvedValue(undefined);
    const handler = createInteractionCreateHandler(createContext(createRegistry([])));
    const interaction = {
      ...createBaseInteraction(),
      commandName: "missing",
      respond,
      isAutocomplete: () => true,
    };

    await handler(interaction as never);

    expect(respond).toHaveBeenCalledWith([]);
  });
});