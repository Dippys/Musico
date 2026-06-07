import { bindCommand } from "../commands/admin/bind.js";
import { djModeCommand } from "../commands/admin/djmode.js";
import { helpCommand } from "../commands/admin/help.js";
import { pingCommand } from "../commands/admin/ping.js";
import { restartCommand } from "../commands/admin/restart.js";
import { settingsCommand } from "../commands/admin/settings.js";
import { statsCommand } from "../commands/admin/stats.js";
import { twentyFourSevenCommand } from "../commands/music/247.js";
import { autoplayCommand } from "../commands/music/autoplay.js";
import { clearCommand } from "../commands/music/clear.js";
import { filterCommand } from "../commands/music/filter.js";
import { joinCommand } from "../commands/music/join.js";
import { leaveCommand } from "../commands/music/leave.js";
import { moveCommand } from "../commands/music/move.js";
import { nowPlayingCommand } from "../commands/music/nowplaying.js";
import { pauseCommand } from "../commands/music/pause.js";
import { playCommand } from "../commands/music/play.js";
import { playNextCommand } from "../commands/music/playnext.js";
import { queueCommand } from "../commands/music/queue.js";
import { removeCommand } from "../commands/music/remove.js";
import { repeatCommand } from "../commands/music/repeat.js";
import { resumeCommand } from "../commands/music/resume.js";
import { seekCommand, seekModalHandler } from "../commands/music/seek.js";
import { shuffleCommand } from "../commands/music/shuffle.js";
import { skipCommand } from "../commands/music/skip.js";
import { skipToCommand } from "../commands/music/skipto.js";
import { stopCommand } from "../commands/music/stop.js";
import { volumeCommand } from "../commands/music/volume.js";
import { playbackButtonHandlers } from "../components/buttons/playbackControls.js";
import { queuePageSelectHandler } from "../components/selects/queuePageSelect.js";
import { searchResultSelectHandler } from "../components/selects/searchResultSelect.js";
import type { SlashCommand } from "../types/commands.js";
import type {
  ButtonHandler,
  ModalHandler,
  StringSelectHandler,
} from "../types/interactions.js";

export interface BotRegistry {
  buttonHandlers: ReadonlyMap<string, ButtonHandler>;
  commands: readonly SlashCommand[];
  commandsByName: ReadonlyMap<string, SlashCommand>;
  modalHandlers: ReadonlyMap<string, ModalHandler>;
  stringSelectHandlers: ReadonlyMap<string, StringSelectHandler>;
}

export interface RegistryCounts {
  buttonHandlerCount: number;
  commandCount: number;
  modalHandlerCount: number;
  stringSelectHandlerCount: number;
}

const commands: readonly SlashCommand[] = [
  bindCommand,
  djModeCommand,
  helpCommand,
  pingCommand,
  restartCommand,
  settingsCommand,
  statsCommand,
  twentyFourSevenCommand,
  autoplayCommand,
  clearCommand,
  filterCommand,
  joinCommand,
  leaveCommand,
  moveCommand,
  nowPlayingCommand,
  pauseCommand,
  playCommand,
  playNextCommand,
  queueCommand,
  removeCommand,
  repeatCommand,
  resumeCommand,
  seekCommand,
  shuffleCommand,
  skipCommand,
  skipToCommand,
  stopCommand,
  volumeCommand,
];
const buttonHandlers: readonly ButtonHandler[] = [...playbackButtonHandlers];
const stringSelectHandlers: readonly StringSelectHandler[] = [
  queuePageSelectHandler,
  searchResultSelectHandler,
];
const modalHandlers: readonly ModalHandler[] = [seekModalHandler];

const buildHandlerMap = <T extends { customId: string }>(
  handlers: readonly T[],
): ReadonlyMap<string, T> => {
  return new Map(handlers.map((handler) => [handler.customId, handler] as const));
};

const buildCommandMap = (
  entries: readonly SlashCommand[],
): ReadonlyMap<string, SlashCommand> => {
  return new Map(
    entries.map((command) => [command.data.toJSON().name, command] as const),
  );
};

export const botRegistry: BotRegistry = {
  buttonHandlers: buildHandlerMap(buttonHandlers),
  commands,
  commandsByName: buildCommandMap(commands),
  modalHandlers: buildHandlerMap(modalHandlers),
  stringSelectHandlers: buildHandlerMap(stringSelectHandlers),
};

export const getRegistryCounts = (
  registry: BotRegistry = botRegistry,
): RegistryCounts => {
  return {
    buttonHandlerCount: registry.buttonHandlers.size,
    commandCount: registry.commands.length,
    modalHandlerCount: registry.modalHandlers.size,
    stringSelectHandlerCount: registry.stringSelectHandlers.size,
  };
};

export const slashCommandData = botRegistry.commands.map((command) =>
  command.data.toJSON(),
);