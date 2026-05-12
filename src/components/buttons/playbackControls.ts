import { ButtonBuilder, ButtonStyle } from "discord.js";

import { replyWithError } from "../../bot/interactionReplies.js";
import { createQueueView } from "../../display/queueView.js";
import { createButtonRow, replyWithDisplay } from "../../display/shared.js";
import { requireSameVoiceChannel } from "../../guards/requireSameVoiceChannel.js";
import type { GuildPlayerState } from "../../music/types.js";
import type { ButtonHandler } from "../../types/interactions.js";

import {
  requireControlledPlaybackAccess,
  requireMusicChannelAccess,
  syncDisplayChannelForInteraction,
} from "../../commands/music/shared.js";

export const playbackButtonCustomIds = {
  previous: "music:previous",
  queue: "music:queue",
  repeat: "music:repeat",
  shuffle: "music:shuffle",
  skip: "music:skip",
  stop: "music:stop",
  togglePause: "music:toggle-pause",
} as const;

const canGoBack = (state: GuildPlayerState): boolean => {
  return (
    state.currentItem !== null &&
    (state.history.length > 0 || state.playbackPositionMs > 5_000)
  );
};

const createPreviousButton = (state: GuildPlayerState): ButtonBuilder => {
  return new ButtonBuilder()
    .setCustomId(playbackButtonCustomIds.previous)
    .setDisabled(!canGoBack(state))
    .setLabel("Back")
    .setStyle(ButtonStyle.Secondary);
};

const createPauseButton = (state: GuildPlayerState): ButtonBuilder => {
  return new ButtonBuilder()
    .setCustomId(playbackButtonCustomIds.togglePause)
    .setDisabled(state.currentItem === null)
    .setLabel(state.paused ? "Resume" : "Pause")
    .setStyle(ButtonStyle.Secondary);
};

const createSkipButton = (state: GuildPlayerState): ButtonBuilder => {
  return new ButtonBuilder()
    .setCustomId(playbackButtonCustomIds.skip)
    .setDisabled(state.currentItem === null)
    .setLabel("Next")
    .setStyle(ButtonStyle.Primary);
};

const createStopButton = (state: GuildPlayerState): ButtonBuilder => {
  return new ButtonBuilder()
    .setCustomId(playbackButtonCustomIds.stop)
    .setDisabled(state.currentItem === null && state.queue.length === 0)
    .setLabel("Stop")
    .setStyle(ButtonStyle.Danger);
};

const createShuffleButton = (state: GuildPlayerState): ButtonBuilder => {
  return new ButtonBuilder()
    .setCustomId(playbackButtonCustomIds.shuffle)
    .setDisabled(state.queue.length < 2)
    .setLabel("Shuffle")
    .setStyle(ButtonStyle.Secondary);
};

const createRepeatButton = (state: GuildPlayerState): ButtonBuilder => {
  return new ButtonBuilder()
    .setCustomId(playbackButtonCustomIds.repeat)
    .setDisabled(state.currentItem === null && state.queue.length === 0)
    .setLabel(`Repeat ${state.repeatMode}`)
    .setStyle(ButtonStyle.Secondary);
};

const createQueueButton = (state: GuildPlayerState): ButtonBuilder => {
  return new ButtonBuilder()
    .setCustomId(playbackButtonCustomIds.queue)
    .setDisabled(state.currentItem === null && state.queue.length === 0)
    .setLabel("Queue")
    .setStyle(ButtonStyle.Secondary);
};

const requirePlaybackInteraction = async (
  interaction: Parameters<ButtonHandler["execute"]>[0],
  context: Parameters<ButtonHandler["execute"]>[1],
  options: {
    requireCurrentItem?: boolean;
    requireQueueItems?: boolean;
  } = {},
) => {
  await interaction.deferUpdate();

  if (!(await requireControlledPlaybackAccess(interaction, context))) {
    return null;
  }

  const voiceContext = await requireSameVoiceChannel(
    interaction,
    context.music.guildPlayers,
    { checkPermissions: true },
  );

  if (!voiceContext) {
    return null;
  }

  syncDisplayChannelForInteraction(interaction, context.music);

  const state = context.music.guildPlayers.getState(voiceContext.guildId);

  if (!state) {
    await replyWithError(interaction, "The music player is not available right now.");
    return null;
  }

  if (options.requireCurrentItem && !state.currentItem) {
    await replyWithError(interaction, "Nothing is playing right now.");
    return null;
  }

  if (options.requireQueueItems && state.queue.length === 0) {
    await replyWithError(interaction, "There are not enough queued tracks to do that.");
    return null;
  }

  return {
    state,
    voiceContext,
  };
};

const previousButtonHandler: ButtonHandler = {
  customId: playbackButtonCustomIds.previous,
  async execute(interaction, context) {
    const playback = await requirePlaybackInteraction(interaction, context, {
      requireCurrentItem: true,
    });

    if (!playback) {
      return;
    }

    if (!canGoBack(playback.state)) {
      await replyWithError(interaction, "There is no previous track to return to yet.");
      return;
    }

    await context.music.guildPlayers.previous(playback.voiceContext.guildId);
  },
};

const togglePauseButtonHandler: ButtonHandler = {
  customId: playbackButtonCustomIds.togglePause,
  async execute(interaction, context) {
    const playback = await requirePlaybackInteraction(interaction, context, {
      requireCurrentItem: true,
    });

    if (!playback) {
      return;
    }

    if (playback.state.paused) {
      await context.music.guildPlayers.resume(playback.voiceContext.guildId);
      return;
    }

    await context.music.guildPlayers.pause(playback.voiceContext.guildId);
  },
};

const skipButtonHandler: ButtonHandler = {
  customId: playbackButtonCustomIds.skip,
  async execute(interaction, context) {
    const playback = await requirePlaybackInteraction(interaction, context, {
      requireCurrentItem: true,
    });

    if (!playback) {
      return;
    }

    await context.music.guildPlayers.skip(playback.voiceContext.guildId);
  },
};

const stopButtonHandler: ButtonHandler = {
  customId: playbackButtonCustomIds.stop,
  async execute(interaction, context) {
    const playback = await requirePlaybackInteraction(interaction, context);

    if (!playback) {
      return;
    }

    if (playback.state.currentItem === null && playback.state.queue.length === 0) {
      await replyWithError(interaction, "There is nothing to stop right now.");
      return;
    }

    await context.music.guildPlayers.stop(playback.voiceContext.guildId);
  },
};

const shuffleButtonHandler: ButtonHandler = {
  customId: playbackButtonCustomIds.shuffle,
  async execute(interaction, context) {
    const playback = await requirePlaybackInteraction(interaction, context, {
      requireQueueItems: true,
    });

    if (!playback) {
      return;
    }

    if (playback.state.queue.length < 2) {
      await replyWithError(interaction, "Add at least two queued tracks before shuffling.");
      return;
    }

    await context.music.guildPlayers.shuffle(playback.voiceContext.guildId);
  },
};

const repeatButtonHandler: ButtonHandler = {
  customId: playbackButtonCustomIds.repeat,
  async execute(interaction, context) {
    const playback = await requirePlaybackInteraction(interaction, context);

    if (!playback) {
      return;
    }

    if (playback.state.currentItem === null && playback.state.queue.length === 0) {
      await replyWithError(interaction, "There is nothing queued to repeat right now.");
      return;
    }

    await context.music.guildPlayers.cycleRepeatMode(playback.voiceContext.guildId);
  },
};

const queueButtonHandler: ButtonHandler = {
  customId: playbackButtonCustomIds.queue,
  async execute(interaction, context) {
    if (!(await requireMusicChannelAccess(interaction, context.music))) {
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

    if (!state || (state.currentItem === null && state.queue.length === 0)) {
      await replyWithError(interaction, "The queue is empty right now.");
      return;
    }

    syncDisplayChannelForInteraction(interaction, context.music);

    await replyWithDisplay(interaction, createQueueView(state));
  },
};

export const createPlaybackControlsRow = (state: GuildPlayerState) => {
  return createPlaybackControlRows(state)[0];
};

export const createPlaybackControlRows = (state: GuildPlayerState) => {
  return [
    createButtonRow(
      createPreviousButton(state),
      createPauseButton(state),
      createSkipButton(state),
      createStopButton(state),
      createQueueButton(state),
    ),
    createButtonRow(
      createShuffleButton(state),
      createRepeatButton(state),
    ),
  ] as const;
};

export const playbackButtonHandlers: readonly ButtonHandler[] = [
  previousButtonHandler,
  togglePauseButtonHandler,
  skipButtonHandler,
  stopButtonHandler,
  shuffleButtonHandler,
  repeatButtonHandler,
  queueButtonHandler,
];