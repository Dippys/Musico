import { replyWithError } from "../../bot/interactionReplies.js";
import { createQueueView } from "../../display/queueView.js";
import { updateDisplay } from "../../display/shared.js";
import type { StringSelectHandler } from "../../types/interactions.js";

import { requireMusicChannelAccess } from "../../commands/music/shared.js";

import { QUEUE_PAGE_SELECT_CUSTOM_ID } from "./constants.js";

export const queuePageSelectHandler: StringSelectHandler = {
  customId: QUEUE_PAGE_SELECT_CUSTOM_ID,
  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) {
      await replyWithError(interaction, "This interaction can only be used in a server.");
      return;
    }

    if (!(await requireMusicChannelAccess(interaction, context.music))) {
      return;
    }

    const state = context.music.guildPlayers.getState(interaction.guildId);

    if (!state) {
      await replyWithError(interaction, "The queue is not available right now.");
      return;
    }

    const requestedPage = Number.parseInt(interaction.values[0] ?? "0", 10);
    await updateDisplay(
      interaction,
      createQueueView(state, {
        page: Number.isNaN(requestedPage) ? 0 : requestedPage,
      }),
    );
  },
};