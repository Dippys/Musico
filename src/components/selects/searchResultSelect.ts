import { randomUUID } from "node:crypto";

import { StringSelectMenuBuilder } from "discord.js";

import { replyWithError } from "../../bot/interactionReplies.js";
import {
  createContainer,
  createDisplayPayload,
  createSelectRow,
  createSeparator,
  createTextBlock,
  formatTrackDuration,
  sanitizeInlineText,
  toDisplayEdit,
  type DisplayPayload,
} from "../../display/shared.js";
import { createStatusView } from "../../display/statusView.js";
import { requireSameVoiceChannel } from "../../guards/requireSameVoiceChannel.js";
import type { QueueItem } from "../../music/types.js";
import type { StringSelectHandler } from "../../types/interactions.js";

import {
  requireControlledPlaybackAccess,
  syncDisplayChannelForInteraction,
} from "../../commands/music/shared.js";

import { SEARCH_RESULT_SELECT_CUSTOM_ID } from "./constants.js";

type PendingSearchAction = "queued" | "queued-next";

interface PendingSearchSelection {
  action: PendingSearchAction;
  guildId: string;
  items: readonly QueueItem[];
  requestedById: string;
}

interface CreateSearchResultViewOptions {
  action: PendingSearchAction;
  guildId: string;
  items: readonly QueueItem[];
  query: string;
  requestedById: string;
}

const MAX_SEARCH_RESULTS = 10;
const SEARCH_SELECTION_TTL_MS = 5 * 60 * 1000;

const pendingSelections = new Map<
  string,
  PendingSearchSelection & { expiresAt: number }
>();

const pruneExpiredSelections = (): void => {
  const now = Date.now();

  for (const [token, selection] of pendingSelections.entries()) {
    if (selection.expiresAt <= now) {
      pendingSelections.delete(token);
    }
  }
};

const createSearchValue = (token: string, itemId: string): string => {
  return `${token}:${itemId}`;
};

const parseSearchValue = (
  value: string,
): { itemId: string; token: string } | null => {
  const separatorIndex = value.indexOf(":");

  if (separatorIndex === -1) {
    return null;
  }

  return {
    itemId: value.slice(separatorIndex + 1),
    token: value.slice(0, separatorIndex),
  };
};

const createSearchSelect = (
  token: string,
  items: readonly QueueItem[],
  action: PendingSearchAction,
): StringSelectMenuBuilder => {
  const select = new StringSelectMenuBuilder()
    .setCustomId(SEARCH_RESULT_SELECT_CUSTOM_ID)
    .setPlaceholder(
      action === "queued-next"
        ? "Choose a result to play next"
        : "Choose a result to queue",
    )
    .setMinValues(1)
    .setMaxValues(1);

  for (const item of items.slice(0, MAX_SEARCH_RESULTS)) {
    select.addOptions({
      description: sanitizeInlineText(
        `${item.track.artist} • ${formatTrackDuration(item.track.lengthMs, item.track.isStream)}`,
        100,
      ),
      label: sanitizeInlineText(item.track.title, 100),
      value: createSearchValue(token, item.id),
    });
  }

  return select;
};

export const createSearchResultSelectionView = (
  options: CreateSearchResultViewOptions,
): DisplayPayload => {
  pruneExpiredSelections();

  const displayedItems = options.items.slice(0, MAX_SEARCH_RESULTS);
  const token = randomUUID();

  pendingSelections.set(token, {
    action: options.action,
    expiresAt: Date.now() + SEARCH_SELECTION_TTL_MS,
    guildId: options.guildId,
    items: displayedItems,
    requestedById: options.requestedById,
  });

  const container = createContainer("brand").addTextDisplayComponents(
    createTextBlock(
      `## ${options.action === "queued-next" ? "Choose The Next Track" : "Choose A Search Result"}`,
    ),
  );

  container.addSeparatorComponents(createSeparator());
  container.addTextDisplayComponents(
    createTextBlock(`Query: ${sanitizeInlineText(options.query, 150)}`),
    createTextBlock(
      options.action === "queued-next"
        ? "Pick one result to insert immediately after the current track."
        : "Pick one result to add to the queue.",
    ),
  );
  container.addActionRowComponents(
    createSelectRow(createSearchSelect(token, displayedItems, options.action)),
  );

  return createDisplayPayload(container);
};

export const searchResultSelectHandler: StringSelectHandler = {
  customId: SEARCH_RESULT_SELECT_CUSTOM_ID,
  async execute(interaction, context) {
    await interaction.deferUpdate();

    const parsed = parseSearchValue(interaction.values[0] ?? "");

    if (!parsed) {
      await replyWithError(interaction, "That search result is no longer available.");
      return;
    }

    pruneExpiredSelections();

    const selection = pendingSelections.get(parsed.token);

    if (!selection) {
      await interaction.editReply(
        toDisplayEdit(
          createStatusView(
            "Search Expired",
            ["Run the command again to get a fresh result list."],
            "warning",
          ),
        ),
      );
      return;
    }

    if (selection.requestedById !== interaction.user.id) {
      await replyWithError(
        interaction,
        "Only the user who started this search can choose a result.",
      );
      return;
    }

    const item = selection.items.find((entry) => entry.id === parsed.itemId);

    if (!item) {
      pendingSelections.delete(parsed.token);
      await interaction.editReply(
        toDisplayEdit(
          createStatusView(
            "Search Expired",
            ["Run the command again to get a fresh result list."],
            "warning",
          ),
        ),
      );
      return;
    }

    if (!(await requireControlledPlaybackAccess(interaction, context))) {
      return;
    }

    const voiceContext = await requireSameVoiceChannel(
      interaction,
      context.music.guildPlayers,
      { checkPermissions: true },
    );

    if (!voiceContext) {
      return;
    }

    const displayChannelId = syncDisplayChannelForInteraction(
      interaction,
      context.music,
    );

    const existingState = context.music.guildPlayers.getState(voiceContext.guildId);

    if (
      existingState?.voice.channelId !== voiceContext.voiceChannel.id ||
      existingState.voice.status !== "connected"
    ) {
      await context.music.guildPlayers.connect(voiceContext.voiceChannel, {
        textChannelId: displayChannelId,
      });
    }

    const result = await context.music.guildPlayers.enqueue(
      voiceContext.guildId,
      [item],
      selection.action === "queued-next"
        ? {
            position: "next",
            startIfIdle: true,
          }
        : {
            startIfIdle: true,
          },
    );

    pendingSelections.delete(parsed.token);

    await interaction.editReply(
      toDisplayEdit(
        createStatusView(
          result.startedItem
            ? "Playing Now"
            : selection.action === "queued-next"
              ? "Added Next"
              : "Queued",
          [
            `${sanitizeInlineText(item.track.title, 120)} by ${sanitizeInlineText(item.track.artist, 80)}`,
            result.startedItem
              ? `Queue: ${result.state.queue.length} waiting`
              : undefined,
          ].filter((line): line is string => typeof line === "string"),
        ),
      ),
    );
  },
};