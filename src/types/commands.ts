import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import type { AppEnv } from "../config/schema.js";
import type { BotMusicRuntimeContext } from "../bot/runtimeContext.js";

export interface CommandExecutionContext {
  commands: readonly SlashCommand[];
  env: AppEnv;
  music: BotMusicRuntimeContext;
}

export type SlashCommandData = Pick<SlashCommandBuilder, "toJSON">;

export interface SlashCommand {
  autocomplete?: (
    interaction: AutocompleteInteraction,
    context: CommandExecutionContext,
  ) => Promise<void>;
  data: SlashCommandData;
  execute: (
    interaction: ChatInputCommandInteraction,
    context: CommandExecutionContext,
  ) => Promise<void>;
}