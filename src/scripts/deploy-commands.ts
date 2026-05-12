import { EnvValidationError, loadEnv } from "../config/env.js";
import { configureLogger, logger } from "../logging/logger.js";
import { REST, Routes } from "discord.js";

import { slashCommandData } from "../bot/registry.js";

const isProductionDeploy = (): boolean => process.env.NODE_ENV === "production";

const deployCommands = async (): Promise<void> => {
  try {
    const env = loadEnv();
    const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
    const productionDeploy = isProductionDeploy();

    configureLogger(env.LOG_LEVEL);

    if (!productionDeploy && !env.DISCORD_GUILD_ID) {
      throw new EnvValidationError(
        "DISCORD_GUILD_ID is required for guild-scoped command deployment outside production.",
      );
    }

    logger.info(
      {
        clientId: env.DISCORD_CLIENT_ID,
        commandCount: slashCommandData.length,
        deploymentScope: productionDeploy ? "global" : "guild",
        guildId: env.DISCORD_GUILD_ID ?? null,
      },
      "Deploying slash commands.",
    );

    if (productionDeploy) {
      await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
        body: slashCommandData,
      });
    } else {
      await rest.put(
        Routes.applicationGuildCommands(
          env.DISCORD_CLIENT_ID,
          env.DISCORD_GUILD_ID as string,
        ),
        {
          body: slashCommandData,
        },
      );
    }

    logger.info(
      {
        commandCount: slashCommandData.length,
        deploymentScope: productionDeploy ? "global" : "guild",
      },
      "Slash commands deployed successfully.",
    );
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }

    console.error("Unexpected deploy bootstrap failure.");
    console.error(error);
    process.exit(1);
  }
};

void deployCommands();