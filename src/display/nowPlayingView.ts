import { createPlaybackControlRows } from "../components/buttons/playbackControls.js";
import { formatFilterPresetLabel } from "../music/filters.js";
import type { GuildPlayerState } from "../music/types.js";

import {
  createContainer,
  createDisplayPayload,
  createSeparator,
  createTextBlock,
  createTrackSection,
  describeQueueItem,
  formatAutoplayModeLabel,
  formatTrackDuration,
  formatQueueCount,
  formatRepeatModeLabel,
  type DisplayPayload,
} from "./shared.js";

const PROGRESS_BAR_WIDTH = 20;

const createSummaryBlock = (state: GuildPlayerState): string => {
  const summaryLines = [
    `Status: ${state.currentItem ? (state.paused ? "paused" : "playing") : "idle"}`,
    `Queue: ${formatQueueCount(state.queue.length)}`,
    `Repeat: ${formatRepeatModeLabel(state.repeatMode)}`,
    `Autoplay: ${formatAutoplayModeLabel(state.autoplayMode)}`,
    `Filter: ${formatFilterPresetLabel(state.filterPreset)}`,
    `Volume: ${state.volume}%`,
  ];

  if (state.voice.channelId) {
    summaryLines.push(`Voice: <#${state.voice.channelId}>`);
  }

  return summaryLines.join("\n");
};

const createProgressBar = (state: GuildPlayerState): string | null => {
  const currentItem = state.currentItem;

  if (!currentItem) {
    return null;
  }

  if (currentItem.track.isStream) {
    return "Progress: [live stream]";
  }

  const durationMs = Math.max(currentItem.track.lengthMs, 1);
  const positionMs = Math.min(
    Math.max(state.playbackPositionMs, 0),
    durationMs,
  );
  const filled = Math.min(
    Math.max(Math.round((positionMs / durationMs) * PROGRESS_BAR_WIDTH), 0),
    PROGRESS_BAR_WIDTH,
  );
  const leading = filled === 0 ? "" : "=".repeat(Math.max(0, filled - 1));
  const marker = filled >= PROGRESS_BAR_WIDTH ? "=" : ">";
  const trailing = "-".repeat(
    Math.max(0, PROGRESS_BAR_WIDTH - leading.length - marker.length),
  );

  return `Progress: [${leading}${marker}${trailing}] ${formatTrackDuration(positionMs)} / ${formatTrackDuration(durationMs)}`;
};

export const createNowPlayingView = (
  state: GuildPlayerState,
): DisplayPayload => {
  const container = createContainer(
    state.lastError ? "warning" : state.paused ? "warning" : "brand",
  ).addTextDisplayComponents(
    createTextBlock(
      `## ${state.currentItem ? (state.paused ? "Playback Paused" : "Now Playing") : state.queue.length > 0 ? "Queue Ready" : "Player Idle"}`,
    ),
  );

  if (state.currentItem) {
    container.addSectionComponents(
      createTrackSection("Current Track", state.currentItem),
    );
  } else if (state.queue.length > 0) {
    container.addSectionComponents(
      createTrackSection("Up Next", state.queue[0] as (typeof state.queue)[number]),
    );
  } else {
    container.addTextDisplayComponents(
      createTextBlock("Nothing is playing right now."),
    );
  }

  container.addSeparatorComponents(createSeparator());
  container.addTextDisplayComponents(createTextBlock(createSummaryBlock(state)));

  const progressBar = createProgressBar(state);

  if (progressBar) {
    container.addTextDisplayComponents(createTextBlock(progressBar));
  }

  const previewItems = state.currentItem
    ? state.queue.slice(0, 3)
    : state.queue.slice(1, 4);

  if (previewItems.length > 0) {
    const previewLines = previewItems.map((item, index) => {
      return `${index + 1}. ${describeQueueItem(item)}`;
    });
    const remainingCount = Math.max(
      0,
      state.queue.length - previewItems.length - (state.currentItem ? 0 : 1),
    );

    container.addSeparatorComponents(createSeparator());
    container.addTextDisplayComponents(
      createTextBlock(
        `**Up Next**\n${previewLines.join("\n")}${remainingCount > 0 ? `\n+ ${remainingCount} more` : ""}`,
      ),
    );
  }

  if (state.lastError) {
    container.addSeparatorComponents(createSeparator());
    container.addTextDisplayComponents(
      createTextBlock(`**Playback issue**\n${state.lastError}`),
    );
  }

  container.addSeparatorComponents(createSeparator());

  for (const row of createPlaybackControlRows(state)) {
    container.addActionRowComponents(row);
  }

  return createDisplayPayload(container);
};