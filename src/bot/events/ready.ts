import type { Client } from "discord.js";

import { logger } from "../../logging/logger.js";
import { getRegistryCounts, type BotRegistry } from "../registry.js";

export const createReadyHandler =
  (registry: BotRegistry) =>
  (client: Client<true>): void => {
    logger.info(
      {
        ...getRegistryCounts(registry),
        guildCount: client.guilds.cache.size,
        userId: client.user.id,
        userTag: client.user.tag,
      },
      "Discord client is ready.",
    );
  };