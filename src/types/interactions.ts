import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";

import type { AppEnv } from "../config/schema.js";
import type { BotMusicRuntimeContext } from "../bot/runtimeContext.js";

export interface InteractionExecutionContext {
  env: AppEnv;
  music: BotMusicRuntimeContext;
}

export interface ButtonHandler {
  customId: string;
  execute: (
    interaction: ButtonInteraction,
    context: InteractionExecutionContext,
  ) => Promise<void>;
}

export interface StringSelectHandler {
  customId: string;
  execute: (
    interaction: StringSelectMenuInteraction,
    context: InteractionExecutionContext,
  ) => Promise<void>;
}

export interface ModalHandler {
  customId: string;
  execute: (
    interaction: ModalSubmitInteraction,
    context: InteractionExecutionContext,
  ) => Promise<void>;
}