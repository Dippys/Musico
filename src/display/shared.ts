import {
  ActionRowBuilder,
  type ApplicationCommandOptionChoiceData,
  ContainerBuilder,
  escapeMarkdown,
  MessageFlags,
  type APIMessageTopLevelComponent,
  type ButtonBuilder,
  type ButtonInteraction,
  type CacheType,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
  type MessageCreateOptions,
  type MessageEditOptions,
  type RepliableInteraction,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  type StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";

import type { AutoplayMode, QueueItem, RepeatMode } from "../music/types.js";

export interface DisplayPayload {
  components: APIMessageTopLevelComponent[];
}

export type DisplayTone = "brand" | "danger" | "neutral" | "success" | "warning";

export type DisplayInteraction = RepliableInteraction<CacheType>;

export type DisplayComponentInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction;

const COMPONENTS_V2_FLAG = MessageFlags.IsComponentsV2;

const toneColors: Record<DisplayTone, number> = {
  brand: 0x2563eb,
  danger: 0xb91c1c,
  neutral: 0x475569,
  success: 0x15803d,
  warning: 0xb45309,
};

const formatClockSegment = (value: number): string => {
  return value.toString().padStart(2, "0");
};

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const createContainer = (
  tone: DisplayTone = "neutral",
): ContainerBuilder => {
  return new ContainerBuilder().setAccentColor(toneColors[tone]);
};

export const createDisplayPayload = (
  container: ContainerBuilder,
): DisplayPayload => {
  return {
    components: [container.toJSON()],
  };
};

export const createTextBlock = (content: string): TextDisplayBuilder => {
  return new TextDisplayBuilder().setContent(content);
};

export const createSeparator = (): SeparatorBuilder => {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
};

export const createButtonRow = (
  ...buttons: ButtonBuilder[]
): ActionRowBuilder<ButtonBuilder> => {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
};

export const createSelectRow = (
  select: StringSelectMenuBuilder,
): ActionRowBuilder<StringSelectMenuBuilder> => {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
};

export const toDisplayReply = (
  payload: DisplayPayload,
): InteractionReplyOptions => {
  return {
    components: payload.components,
    flags: COMPONENTS_V2_FLAG,
  };
};

export const toDisplayMessage = (
  payload: DisplayPayload,
): MessageCreateOptions => {
  return {
    components: payload.components,
    flags: COMPONENTS_V2_FLAG,
  };
};

export const toDisplayEdit = (
  payload: DisplayPayload,
): MessageEditOptions => {
  return {
    components: payload.components,
    flags: COMPONENTS_V2_FLAG,
  };
};

export const toDisplayUpdate = (
  payload: DisplayPayload,
): InteractionUpdateOptions => {
  return {
    components: payload.components,
    flags: COMPONENTS_V2_FLAG,
  };
};

export const replyWithDisplay = async (
  interaction: DisplayInteraction,
  payload: DisplayPayload,
): Promise<void> => {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(toDisplayEdit(payload));
    return;
  }

  await interaction.reply(toDisplayReply(payload));
};

export const updateDisplay = async (
  interaction: DisplayComponentInteraction,
  payload: DisplayPayload,
): Promise<void> => {
  await interaction.update(toDisplayUpdate(payload));
};

export const formatTrackDuration = (
  durationMs: number,
  isStream = false,
): string => {
  if (isStream) {
    return "live";
  }

  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${formatClockSegment(minutes)}:${formatClockSegment(seconds)}`;
  }

  return `${minutes}:${formatClockSegment(seconds)}`;
};

export const sanitizeInlineText = (value: string, maxLength = 100): string => {
  return escapeMarkdown(value).slice(0, maxLength);
};

export const describeQueueItem = (item: QueueItem): string => {
  return `${sanitizeInlineText(item.track.title, 80)} - ${sanitizeInlineText(item.track.artist, 60)} (${formatTrackDuration(item.track.lengthMs, item.track.isStream)})`;
};

export const formatQueueCount = (count: number): string => {
  return count === 1 ? "1 track waiting" : `${count} tracks waiting`;
};

export const formatAutoplayModeLabel = (mode: AutoplayMode): string => {
  switch (mode) {
    case "related":
      return "related";
    default:
      return "off";
  }
};

export const formatRepeatModeLabel = (mode: RepeatMode): string => {
  switch (mode) {
    case "track":
      return "track";
    case "queue":
      return "queue";
    default:
      return "off";
  }
};

export type AutocompleteChoice = ApplicationCommandOptionChoiceData<string | number>;

export const createTrackSection = (
  heading: string,
  item: QueueItem,
  options: {
    extraLines?: readonly string[];
    showRequester?: boolean;
  } = {},
): SectionBuilder => {
  const section = new SectionBuilder().addTextDisplayComponents(
    createTextBlock(`## ${heading}`),
    createTextBlock(`**${sanitizeInlineText(item.track.title, 120)}**`),
  );

  const metadataLines = [
    `${sanitizeInlineText(item.track.artist, 80)} • ${formatTrackDuration(item.track.lengthMs, item.track.isStream)}`,
    ...(options.showRequester === false
      ? []
      : [`Requested by <@${item.requestedById}>`]),
    ...(options.extraLines ?? []),
  ];

  section.addTextDisplayComponents(createTextBlock(metadataLines.join("\n")));

  if (item.track.artworkUrl) {
    section.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(item.track.artworkUrl)
        .setDescription(item.track.title),
    );
  }

  return section;
};