import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";

import type { CommandExecutionContext } from "../../types/commands.js";
import type { InteractionExecutionContext } from "../../types/interactions.js";
import { logger } from "../../logging/logger.js";
import {
  replyUnknownHandler,
  replyWithError,
} from "../interactionReplies.js";
import type { BotRuntimeContext } from "../runtimeContext.js";

const createCommandContext = (
  context: BotRuntimeContext,
): CommandExecutionContext => ({
  commands: context.registry.commands,
  env: context.env,
  music: context.music,
});

const createInteractionContext = (
  context: BotRuntimeContext,
): InteractionExecutionContext => ({
  env: context.env,
  music: context.music,
});

const createLogContext = (interaction: Interaction) => ({
  commandName:
    interaction.isAutocomplete() || interaction.isChatInputCommand()
      ? interaction.commandName
      : undefined,
  customId:
    interaction.isButton() ||
    interaction.isModalSubmit() ||
    interaction.isStringSelectMenu()
      ? interaction.customId
      : undefined,
  guildId: interaction.guildId,
  interactionType: interaction.type,
  userId: interaction.user.id,
});

const respondWithNoAutocompleteChoices = async (
  interaction: AutocompleteInteraction,
): Promise<void> => {
  try {
    await interaction.respond([]);
  } catch {
    logger.debug(createLogContext(interaction), "Autocomplete response already sent.");
  }
};

const handleChatInputCommand = async (
  interaction: ChatInputCommandInteraction,
  context: BotRuntimeContext,
): Promise<void> => {
  const command = context.registry.commandsByName.get(interaction.commandName);

  if (!command) {
    logger.warn(createLogContext(interaction), "Unknown slash command received.");
    await replyUnknownHandler(interaction);
    return;
  }

  await command.execute(interaction, createCommandContext(context));
};

const handleAutocomplete = async (
  interaction: AutocompleteInteraction,
  context: BotRuntimeContext,
): Promise<void> => {
  const command = context.registry.commandsByName.get(interaction.commandName);

  if (!command?.autocomplete) {
    logger.warn(createLogContext(interaction), "Unknown autocomplete handler received.");
    await respondWithNoAutocompleteChoices(interaction);
    return;
  }

  await command.autocomplete(interaction, createCommandContext(context));
};

const handleButton = async (
  interaction: ButtonInteraction,
  context: BotRuntimeContext,
): Promise<void> => {
  const handler = context.registry.buttonHandlers.get(interaction.customId);

  if (!handler) {
    logger.warn(createLogContext(interaction), "Unknown button handler received.");
    await replyUnknownHandler(interaction);
    return;
  }

  await handler.execute(interaction, createInteractionContext(context));
};

const handleStringSelect = async (
  interaction: StringSelectMenuInteraction,
  context: BotRuntimeContext,
): Promise<void> => {
  const handler = context.registry.stringSelectHandlers.get(interaction.customId);

  if (!handler) {
    logger.warn(
      createLogContext(interaction),
      "Unknown string select handler received.",
    );
    await replyUnknownHandler(interaction);
    return;
  }

  await handler.execute(interaction, createInteractionContext(context));
};

const handleModal = async (
  interaction: ModalSubmitInteraction,
  context: BotRuntimeContext,
): Promise<void> => {
  const handler = context.registry.modalHandlers.get(interaction.customId);

  if (!handler) {
    logger.warn(createLogContext(interaction), "Unknown modal handler received.");
    await replyUnknownHandler(interaction);
    return;
  }

  await handler.execute(interaction, createInteractionContext(context));
};

const handleInteractionError = async (
  interaction: Interaction,
  error: unknown,
): Promise<void> => {
  logger.error({ err: error, ...createLogContext(interaction) }, "Interaction handling failed.");

  if (interaction.isAutocomplete()) {
    await respondWithNoAutocompleteChoices(interaction);
    return;
  }

  if (interaction.isRepliable()) {
    await replyWithError(interaction);
  }
};

export const createInteractionCreateHandler =
  (context: BotRuntimeContext) =>
  async (interaction: Interaction): Promise<void> => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleChatInputCommand(interaction, context);
        return;
      }

      if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction, context);
        return;
      }

      if (interaction.isButton()) {
        await handleButton(interaction, context);
        return;
      }

      if (interaction.isStringSelectMenu()) {
        await handleStringSelect(interaction, context);
        return;
      }

      if (interaction.isModalSubmit()) {
        await handleModal(interaction, context);
      }
    } catch (error) {
      await handleInteractionError(interaction, error);
    }
  };