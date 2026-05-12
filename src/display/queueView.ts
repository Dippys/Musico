import { StringSelectMenuBuilder } from "discord.js";

import { QUEUE_PAGE_SELECT_CUSTOM_ID } from "../components/selects/constants.js";
import { formatFilterPresetLabel } from "../music/filters.js";
import type { GuildPlayerState } from "../music/types.js";

import {
  clamp,
  createContainer,
  createDisplayPayload,
  createSelectRow,
  createSeparator,
  createTextBlock,
  createTrackSection,
  describeQueueItem,
  formatAutoplayModeLabel,
  formatQueueCount,
  formatRepeatModeLabel,
  type DisplayPayload,
} from "./shared.js";

export interface QueueViewOptions {
  page?: number;
  pageSize?: number;
}

const MAX_PAGE_OPTIONS = 25;
export const DEFAULT_QUEUE_PAGE_SIZE = 8;

const createQueuePageSelect = (
  pageCount: number,
  currentPage: number,
  pageSize: number,
  totalItems: number,
): StringSelectMenuBuilder => {
  const windowSize = Math.min(pageCount, MAX_PAGE_OPTIONS);
  const halfWindow = Math.floor(windowSize / 2);
  const startPage = clamp(
    currentPage - halfWindow,
    0,
    Math.max(0, pageCount - windowSize),
  );
  const endPage = Math.min(pageCount, startPage + windowSize);

  const select = new StringSelectMenuBuilder()
    .setCustomId(QUEUE_PAGE_SELECT_CUSTOM_ID)
    .setPlaceholder(`Page ${currentPage + 1} of ${pageCount}`)
    .setMinValues(1)
    .setMaxValues(1);

  for (let page = startPage; page < endPage; page += 1) {
    const startTrack = page * pageSize + 1;
    const endTrack = Math.min(totalItems, (page + 1) * pageSize);

    select.addOptions({
      default: page === currentPage,
      description: `Tracks ${startTrack}-${endTrack}`,
      label: `Page ${page + 1}`,
      value: page.toString(),
    });
  }

  return select;
};

export const createQueueView = (
  state: GuildPlayerState,
  options: QueueViewOptions = {},
): DisplayPayload => {
  const pageSize = options.pageSize ?? DEFAULT_QUEUE_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(state.queue.length / pageSize));
  const currentPage = clamp(options.page ?? 0, 0, pageCount - 1);
  const pageStart = currentPage * pageSize;
  const pageItems = state.queue.slice(pageStart, pageStart + pageSize);
  const container = createContainer("brand").addTextDisplayComponents(
    createTextBlock("## Queue"),
  );

  if (state.currentItem) {
    container.addSectionComponents(
      createTrackSection("Now Playing", state.currentItem),
    );
  } else {
    container.addTextDisplayComponents(
      createTextBlock("Nothing is playing right now."),
    );
  }

  container.addSeparatorComponents(createSeparator());

  if (pageItems.length === 0) {
    container.addTextDisplayComponents(
      createTextBlock("Nothing else is queued."),
    );
  } else {
    const queueLines = pageItems.map((item, index) => {
      return `${pageStart + index + 1}. ${describeQueueItem(item)}`;
    });

    container.addTextDisplayComponents(
      createTextBlock(`**Up Next**\n${queueLines.join("\n")}`),
    );
  }

  container.addSeparatorComponents(createSeparator());
  container.addTextDisplayComponents(
    createTextBlock(
      [
        `Page ${currentPage + 1}/${pageCount}`,
        `Queue: ${formatQueueCount(state.queue.length)}`,
        `Repeat: ${formatRepeatModeLabel(state.repeatMode)}`,
        `Autoplay: ${formatAutoplayModeLabel(state.autoplayMode)}`,
        `Filter: ${formatFilterPresetLabel(state.filterPreset)}`,
      ].join("\n"),
    ),
  );

  if (pageCount > 1) {
    container.addActionRowComponents(
      createSelectRow(
        createQueuePageSelect(pageCount, currentPage, pageSize, state.queue.length),
      ),
    );
  }

  return createDisplayPayload(container);
};