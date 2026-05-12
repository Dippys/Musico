import {
  ActionRowBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { formatTrackDuration } from "../../display/shared.js";
import { createStatusView } from "../../display/statusView.js";
import { requireSameVoiceChannel } from "../../guards/requireSameVoiceChannel.js";
import type { ModalHandler } from "../../types/interactions.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  parseTimeInputToMs,
  requireControlledPlaybackAccess,
  respondToCommand,
  respondWithCommandError,
  syncDisplayChannelForInteraction,
} from "./shared.js";

const SEEK_MODAL_CUSTOM_ID = "music:seek-modal";
const SEEK_MODAL_TIME_INPUT_CUSTOM_ID = "music:seek-time";

const createSeekModal = () => {
  const input = new TextInputBuilder()
    .setCustomId(SEEK_MODAL_TIME_INPUT_CUSTOM_ID)
    .setLabel("Seek time")
    .setPlaceholder("1:23 or 83")
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  return new ModalBuilder()
    .setCustomId(SEEK_MODAL_CUSTOM_ID)
    .setTitle("Seek Playback")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
};

const validateSeekRequest = (
  positionMs: number,
  durationMs: number,
): string | null => {
  if (positionMs < 0) {
    return "Seek time must be zero or greater.";
  }

  if (positionMs > durationMs) {
    return `Seek time must be within the track length of ${formatTrackDuration(durationMs)}.`;
  }

  return null;
};

const executeSeek = async (
  interaction: Parameters<ModalHandler["execute"]>[0] | Parameters<SlashCommand["execute"]>[0],
  context: Parameters<ModalHandler["execute"]>[1] | Parameters<SlashCommand["execute"]>[1],
  rawTime: string,
): Promise<void> => {
  if (!(await requireControlledPlaybackAccess(interaction, context))) {
    return;
  }

  const voiceContext = await requireSameVoiceChannel(
    interaction,
    context.music.guildPlayers,
  );

  if (!voiceContext) {
    return;
  }

  const state = context.music.guildPlayers.getState(voiceContext.guildId);

  if (!state?.currentItem) {
    await respondWithCommandError(interaction, "Nothing is playing right now.");
    return;
  }

  if (state.currentItem.track.isStream || !state.currentItem.track.isSeekable) {
    await respondWithCommandError(interaction, "That track cannot be seeked.");
    return;
  }

  const positionMs = parseTimeInputToMs(rawTime);

  if (positionMs === null) {
    await respondWithCommandError(
      interaction,
      "Enter a valid timestamp like 1:23 or 83 seconds.",
    );
    return;
  }

  const validationError = validateSeekRequest(
    positionMs,
    state.currentItem.track.lengthMs,
  );

  if (validationError) {
    await respondWithCommandError(interaction, validationError);
    return;
  }

  syncDisplayChannelForInteraction(interaction, context.music);

  const nextState = await context.music.guildPlayers.seek(
    voiceContext.guildId,
    positionMs,
  );

  if (!nextState?.currentItem) {
    await respondWithCommandError(interaction, "I couldn't seek playback right now.");
    return;
  }

  await respondToCommand(
    interaction,
    createStatusView("Seeked", [
      `${formatTrackDuration(positionMs)} / ${formatTrackDuration(nextState.currentItem.track.lengthMs)}`,
    ]),
  );
};

export const seekCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Seek within the current track.")
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("Target time like 1:23 or 83 seconds."),
    ),
  async execute(interaction, context) {
    const rawTime = interaction.options.getString("time");

    if (rawTime === null) {
      if (!(await requireControlledPlaybackAccess(interaction, context))) {
        return;
      }

      const voiceContext = await requireSameVoiceChannel(
        interaction,
        context.music.guildPlayers,
      );

      if (!voiceContext) {
        return;
      }

      const state = context.music.guildPlayers.getState(voiceContext.guildId);

      if (!state?.currentItem) {
        await respondWithCommandError(interaction, "Nothing is playing right now.");
        return;
      }

      if (state.currentItem.track.isStream || !state.currentItem.track.isSeekable) {
        await respondWithCommandError(interaction, "That track cannot be seeked.");
        return;
      }

      await interaction.showModal(createSeekModal());
      return;
    }

    await executeSeek(interaction, context, rawTime);
  },
};

export const seekModalHandler: ModalHandler = {
  customId: SEEK_MODAL_CUSTOM_ID,
  async execute(interaction, context) {
    await executeSeek(
      interaction,
      context,
      interaction.fields.getTextInputValue(SEEK_MODAL_TIME_INPUT_CUSTOM_ID),
    );
  },
};