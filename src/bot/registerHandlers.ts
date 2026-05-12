import { Events, type Client } from "discord.js";

import { logger } from "../logging/logger.js";
import { createInteractionCreateHandler } from "./events/interactionCreate.js";
import { createReadyHandler } from "./events/ready.js";
import { createVoiceStateUpdateHandler } from "./events/voiceStateUpdate.js";
import { getRegistryCounts } from "./registry.js";
import type { BotRuntimeContext } from "./runtimeContext.js";

export const registerHandlers = (
  client: Client,
  context: BotRuntimeContext,
): void => {
  client.once(Events.ClientReady, createReadyHandler(context.registry));
  client.on(Events.InteractionCreate, createInteractionCreateHandler(context));
  client.on(
    Events.VoiceStateUpdate,
    createVoiceStateUpdateHandler(context.music.guildPlayers),
  );

  logger.info(
    {
      ...getRegistryCounts(context.registry),
      readyEvent: Events.ClientReady,
      voiceStateEvent: Events.VoiceStateUpdate,
    },
    "Registered Discord lifecycle handlers.",
  );
};