import type { VoiceState } from "discord.js";

import { logger } from "../../logging/logger.js";
import type { GuildPlayerService } from "../../music/GuildPlayerService.js";

const createLogContext = (oldState: VoiceState, newState: VoiceState) => ({
  guildId: newState.guild.id,
  newChannelId: newState.channelId,
  oldChannelId: oldState.channelId,
  userId: newState.id,
});

export const createVoiceStateUpdateHandler =
  (guildPlayers: GuildPlayerService) =>
  async (oldState: VoiceState, newState: VoiceState): Promise<void> => {
    const meId =
      newState.guild.members.me?.id ??
      oldState.guild.members.me?.id ??
      newState.guild.client.user?.id ??
      oldState.guild.client.user?.id;

    if (!meId || newState.id !== meId) {
      return;
    }

    try {
      await guildPlayers.handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      logger.error(
        { err: error, ...createLogContext(oldState, newState) },
        "Failed to synchronize bot voice state.",
      );
    }
  };