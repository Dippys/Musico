import type {
  AutocompleteInteraction,
  ButtonInteraction,
  CacheType,
  RepliableInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";

import type { BotMusicRuntimeContext } from "../../bot/runtimeContext.js";
import { createErrorView } from "../../display/errorView.js";
import type { AppEnv } from "../../config/schema.js";
import {
  type AutocompleteChoice,
  describeQueueItem,
  formatTrackDuration,
  replyWithDisplay,
  sanitizeInlineText,
  type DisplayPayload,
} from "../../display/shared.js";
import { requireBoundChannel } from "../../guards/requireBoundChannel.js";
import { requireDjAccess } from "../../guards/requireDjAccess.js";
import { createStatusView } from "../../display/statusView.js";
import type { GuildPlayerState, QueueItem } from "../../music/types.js";

export { describeQueueItem, formatTrackDuration };

export interface DisplayTargetInteraction {
  channelId: string | null;
  guildId: string | null;
  inCachedGuild(): boolean;
}

export type MusicInteraction =
  | ButtonInteraction
  | ChatInputCommandInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction;

const pluralize = (count: number, singular: string, plural = `${singular}s`): string => {
  return count === 1 ? singular : plural;
};

export const createQueueResultView = (
  enqueuedItems: readonly QueueItem[],
  startedItem: QueueItem | null,
  state: GuildPlayerState,
  options: {
    action: "queued" | "queued-next";
  },
): DisplayPayload => {
  const details: string[] = [];
  let title = "Queued";

  if (startedItem) {
    title = "Playing Now";
    details.push(describeQueueItem(startedItem));

    if (state.queue.length > 0) {
      details.push(
        `Queue: ${state.queue.length} ${pluralize(state.queue.length, "track")} waiting`,
      );
    }
  } else if (enqueuedItems.length === 1) {
    title = options.action === "queued-next" ? "Added Next" : "Queued";
    details.push(describeQueueItem(enqueuedItems[0] as QueueItem));
  } else {
    title = options.action === "queued-next" ? "Inserted Tracks" : "Queued Tracks";
    details.push(`${enqueuedItems.length} tracks added.`);
  }

  return createStatusView(title, details);
};

export const getPlaybackErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (
    error.message.includes("No Lavalink nodes are available") ||
    error.message.includes("Can't find any nodes to connect on")
  ) {
    return "Playback is unavailable because no Lavalink node is connected.";
  }

  if (error.message.includes("voice connection is not established")) {
    return "I couldn't establish the voice connection. Check my access to that channel and try again.";
  }

  if (error.message.startsWith("Track resolution failed:")) {
    return "I couldn't load that track from Lavalink right now.";
  }

  return fallback;
};

export const respondToCommand = async (
  interaction: RepliableInteraction<CacheType>,
  payload: DisplayPayload,
): Promise<void> => {
  await replyWithDisplay(interaction, payload);
};

export const respondWithCommandError = async (
  interaction: RepliableInteraction<CacheType>,
  content: string,
): Promise<void> => {
  await replyWithDisplay(interaction, createErrorView(content));
};

export const respondToAutocomplete = async (
  interaction: AutocompleteInteraction,
  choices: readonly AutocompleteChoice[],
): Promise<void> => {
  try {
    await interaction.respond([...choices].slice(0, 25));
  } catch {
    return;
  }
};

export const createQueuePositionChoices = (
  items: readonly QueueItem[],
  focusedValue: number | string,
): readonly AutocompleteChoice[] => {
  const normalizedFocused = String(focusedValue).trim().toLowerCase();

  return items
    .map((item, index) => ({
      name: `${index + 1}. ${sanitizeInlineText(item.track.title, 70)}`,
      value: index + 1,
    }))
    .filter((choice) => {
      if (normalizedFocused.length === 0) {
        return true;
      }

      return (
        choice.value.toString().startsWith(normalizedFocused) ||
        choice.name.toLowerCase().includes(normalizedFocused)
      );
    })
    .slice(0, 25);
};

export const parseTimeInputToMs = (value: string): number | null => {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10) * 1_000;
  }

  const segments = normalized.split(":");

  if (segments.length < 2 || segments.length > 3) {
    return null;
  }

  const numericSegments = segments.map((segment) => Number.parseInt(segment, 10));

  if (
    numericSegments.some((segment, index) => {
      if (Number.isNaN(segment)) {
        return true;
      }

      return index > 0 && segment >= 60;
    })
  ) {
    return null;
  }

  const totalSeconds = numericSegments.reduce((seconds, segment) => {
    return seconds * 60 + segment;
  }, 0);

  return totalSeconds * 1_000;
};

export const formatBooleanState = (enabled: boolean): string => {
  return enabled ? "enabled" : "disabled";
};

export const formatSettingSource = (isDefault: boolean): string => {
  return isDefault ? "default" : "persisted";
};

export const resolveDisplayChannelId = (
  guildId: string,
  interactionChannelId: string | null,
  music: Pick<BotMusicRuntimeContext, "guildSettings">,
): string | null => {
  return (
    music.guildSettings.getSnapshot(guildId).settings.boundTextChannelId ??
    interactionChannelId
  );
};

export const syncDisplayChannelForInteraction = (
  interaction: DisplayTargetInteraction,
  music: Pick<BotMusicRuntimeContext, "guildPlayers" | "guildSettings">,
): string | null => {
  if (!interaction.inCachedGuild() || !interaction.guildId) {
    return null;
  }

  const displayChannelId = resolveDisplayChannelId(
    interaction.guildId,
    interaction.channelId,
    music,
  );

  music.guildPlayers.setTextChannelId(interaction.guildId, displayChannelId);
  return displayChannelId;
};

export const requireMusicChannelAccess = async (
  interaction: MusicInteraction,
  music: Pick<BotMusicRuntimeContext, "guildSettings">,
): Promise<boolean> => {
  return requireBoundChannel(interaction, music.guildSettings);
};

export const requireControlledPlaybackAccess = async (
  interaction: MusicInteraction,
  context: {
    env: AppEnv;
    music: Pick<BotMusicRuntimeContext, "guildSettings">;
  },
): Promise<boolean> => {
  if (!(await requireMusicChannelAccess(interaction, context.music))) {
    return false;
  }

  return requireDjAccess(interaction, context.env, context.music.guildSettings);
};