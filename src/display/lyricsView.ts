import { getLyricsWindow, type LyricsResult } from "../music/LyricsService.js";
import type { GuildPlayerState, QueueItem } from "../music/types.js";

import {
  createContainer,
  createDisplayPayload,
  createSeparator,
  createTextBlock,
  formatTrackDuration,
  sanitizeInlineText,
  type DisplayPayload,
} from "./shared.js";

const MAX_PLAIN_LYRICS_CHARS = 1_500;
const MAX_PLAIN_LYRICS_LINES = 12;

const formatPositionSummary = (state: GuildPlayerState, item: QueueItem): string => {
  const currentPositionMs = Math.max(0, state.playbackPositionMs);
  const positionLabel = formatTrackDuration(currentPositionMs, item.track.isStream);
  const durationLabel = formatTrackDuration(item.track.lengthMs, item.track.isStream);

  return `Position: ${positionLabel} / ${durationLabel}`;
};

const createPlainLyricsExcerpt = (plainLyrics: string): string => {
  const renderedLines: string[] = [];
  let renderedLength = 0;

  for (const rawLine of plainLyrics.split(/\r?\n/u)) {
    const normalizedLine = sanitizeInlineText(rawLine, 220).trim();

    if (normalizedLine.length === 0) {
      continue;
    }

    if (renderedLines.length >= MAX_PLAIN_LYRICS_LINES) {
      break;
    }

    if (renderedLength + normalizedLine.length > MAX_PLAIN_LYRICS_CHARS) {
      break;
    }

    renderedLines.push(normalizedLine);
    renderedLength += normalizedLine.length;
  }

  if (renderedLines.length === 0) {
    return "Lyrics are available for this track, but they could not be rendered cleanly.";
  }

  const sourceLineCount = plainLyrics
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
  const suffix = sourceLineCount > renderedLines.length ? "\n..." : "";

  return renderedLines.join("\n") + suffix;
};

const createSyncedLyricsExcerpt = (
  lyrics: LyricsResult,
  state: GuildPlayerState,
): string => {
  const window = getLyricsWindow(lyrics.syncedLyrics, state.playbackPositionMs, {
    after: 4,
    before: 1,
  });

  if (window.lines.length === 0) {
    return "Synced lyrics are available, but there is no lyric line to show at the current position yet.";
  }

  return window.lines
    .map((line, index) => {
      const prefix = index === window.highlightedLineIndex ? "> " : "  ";
      return `${prefix}${sanitizeInlineText(line.text, 180)}`;
    })
    .join("\n");
};

export const createLyricsView = (
  state: GuildPlayerState,
  lyrics: LyricsResult | null,
  options: {
    live?: boolean;
  } = {},
): DisplayPayload => {
  const currentItem = state.currentItem;

  if (!currentItem) {
    return createDisplayPayload(
      createContainer("warning").addTextDisplayComponents(
        createTextBlock("## Lyrics"),
        createTextBlock("Nothing is playing right now."),
      ),
    );
  }

  const live = options.live ?? false;
  const container = createContainer(lyrics ? "brand" : "warning").addTextDisplayComponents(
    createTextBlock(`## ${live ? "Live Lyrics" : "Lyrics"}`),
  );

  container.addTextDisplayComponents(
    createTextBlock(`**${sanitizeInlineText(currentItem.track.title, 120)}**`),
    createTextBlock(
      [
        sanitizeInlineText(currentItem.track.artist, 80),
        formatPositionSummary(state, currentItem),
        live
          ? state.paused
            ? "Live updates are paused with playback."
            : "This panel refreshes about every 5 seconds while playback is active."
          : "Snapshot taken at the current playback position.",
      ].join("\n"),
    ),
  );

  container.addSeparatorComponents(createSeparator());

  if (!lyrics) {
    container.addTextDisplayComponents(
      createTextBlock("No lyrics were found for this track."),
      createTextBlock(
        live
          ? "This panel will update automatically if the next track has lyrics."
          : "Try again later or on another track; synced lyrics depend on LRCLIB coverage.",
      ),
    );

    return createDisplayPayload(container);
  }

  if (lyrics.instrumental) {
    container.addTextDisplayComponents(
      createTextBlock("This track is marked as instrumental, so no lyrics are available."),
    );
  } else if (lyrics.syncedLyrics.length > 0) {
    container.addTextDisplayComponents(
      createTextBlock(
        `**${live ? "Live synced lyrics" : "Synced lyrics"}**\n${createSyncedLyricsExcerpt(lyrics, state)}`,
      ),
    );
  } else if (lyrics.plainLyrics) {
    container.addTextDisplayComponents(
      createTextBlock(`**Lyrics**\n${createPlainLyricsExcerpt(lyrics.plainLyrics)}`),
    );
  } else {
    container.addTextDisplayComponents(
      createTextBlock("Lyrics metadata was found, but no lyric lines were returned."),
    );
  }

  container.addSeparatorComponents(createSeparator());
  container.addTextDisplayComponents(
    createTextBlock(
      [
        `Source: ${lyrics.provider.toUpperCase()}`,
        lyrics.syncedLyrics.length > 0
          ? live
            ? "Synced lines will keep following the current song position."
            : "Run `/lyrics live:true` to pin a live-updating lyrics panel in this channel."
          : "Synced lyrics were not available for this track.",
      ].join("\n"),
    ),
  );

  return createDisplayPayload(container);
};