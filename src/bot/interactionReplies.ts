import {
  type CacheType,
  type InteractionDeferReplyOptions,
  type InteractionReplyOptions,
  type RepliableInteraction,
} from "discord.js";

import { createErrorView } from "../display/errorView.js";
import { toDisplayReply } from "../display/shared.js";

type ReplyableInteraction = RepliableInteraction<CacheType>;

const createDisplayErrorPayload = (
  content: string,
): InteractionReplyOptions => {
  return toDisplayReply(createErrorView(content));
};

const sendDisplayReply = async (
  interaction: ReplyableInteraction,
  content: string,
): Promise<void> => {
  const payload = createDisplayErrorPayload(content);

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
};

export const deferReply = async (
  interaction: ReplyableInteraction,
  flags?: InteractionDeferReplyOptions["flags"],
): Promise<void> => {
  if (interaction.deferred || interaction.replied) {
    return;
  }

  if (flags === undefined) {
    await interaction.deferReply();
    return;
  }

  await interaction.deferReply({ flags });
};

export const replyUnknownHandler = async (
  interaction: ReplyableInteraction,
  message = "That interaction is not available right now. Please try again.",
): Promise<void> => {
  await sendDisplayReply(interaction, message);
};

export const replyWithError = async (
  interaction: ReplyableInteraction,
  message = "Something went wrong while handling that interaction.",
): Promise<void> => {
  await sendDisplayReply(interaction, message);
};