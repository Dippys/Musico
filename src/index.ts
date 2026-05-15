import { EnvValidationError, loadEnv } from "./config/env.js";
import { configureLogger, logger } from "./logging/logger.js";
import type { AppEnv } from "./config/schema.js";
import type { Client } from "discord.js";

import { createDiscordClient } from "./bot/client.js";
import { botRegistry, getRegistryCounts } from "./bot/registry.js";
import { registerHandlers } from "./bot/registerHandlers.js";
import { DisplayMessageController } from "./music/DisplayMessageController.js";
import { GuildSettingsStore } from "./music/GuildSettingsStore.js";
import { GuildPlayerService } from "./music/GuildPlayerService.js";
import { LavalinkConfigError, LavalinkService } from "./music/LavalinkService.js";
import { LyricsMessageController } from "./music/LyricsMessageController.js";
import { LyricsService } from "./music/LyricsService.js";
import { TrackResolverService } from "./music/TrackResolverService.js";

const registerShutdownHandlers = (client: Client): void => {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, "Shutting down Discord client.");
    client.destroy();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    shutdown("SIGTERM");
  });
};

const logStartupContext = (env: AppEnv): void => {
  logger.info(
    {
      ...getRegistryCounts(botRegistry),
      clientId: env.DISCORD_CLIENT_ID,
      defaultVolume: env.DEFAULT_VOLUME,
      inactivityTimeoutMs: env.INACTIVITY_TIMEOUT_MS,
      lavalinkNodes: env.LAVALINK_NODES.map((node) => node.name),
    },
    "Configuration loaded. Logging into Discord.",
  );
};

const start = async (): Promise<void> => {
  let client: Client | undefined;

  try {
    const env = loadEnv();

    configureLogger(env.LOG_LEVEL);

    client = createDiscordClient();
    const lavalink = new LavalinkService(client, env);
    const guildSettings = new GuildSettingsStore();
    const guildPlayers = new GuildPlayerService(env, lavalink, guildSettings);
    const displayMessages = new DisplayMessageController(client, guildPlayers);
    const lyrics = new LyricsService();
    const lyricsMessages = new LyricsMessageController(client, guildPlayers, lyrics);
    const trackResolver = new TrackResolverService(lavalink);

    registerShutdownHandlers(client);
    registerHandlers(client, {
      env,
      music: {
        displayMessages,
        guildSettings,
        guildPlayers,
        lavalink,
        lyrics,
        lyricsMessages,
        trackResolver,
      },
      registry: botRegistry,
    });
    logStartupContext(env);

    await client.login(env.DISCORD_TOKEN);
  } catch (error) {
    if (error instanceof EnvValidationError || error instanceof LavalinkConfigError) {
      console.error(error.message);
      process.exit(1);
    }

    client?.destroy();

    console.error("Unexpected startup failure.");
    console.error(error);
    process.exit(1);
  }
};

void start();