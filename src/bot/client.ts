import { Client, GatewayIntentBits } from "discord.js";

export const createDiscordClient = (): Client => {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
};