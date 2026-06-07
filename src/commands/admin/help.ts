import { ApplicationCommandOptionType, SlashCommandBuilder } from "discord.js";

import {
  createContainer,
  createDisplayPayload,
  createSeparator,
  createTextBlock,
} from "../../display/shared.js";
import type { SlashCommand } from "../../types/commands.js";

import {
  respondToAutocomplete,
  respondToCommand,
  respondWithCommandError,
} from "../music/shared.js";

interface CommandOptionDefinition {
  autocomplete?: boolean;
  choices?: readonly {
    name: string;
    value: number | string;
  }[];
  description: string;
  name: string;
  options?: readonly CommandOptionDefinition[];
  required?: boolean;
  type: number;
}

interface CommandDefinition {
  description: string;
  name: string;
  options?: readonly CommandOptionDefinition[];
}

const adminCommandNames = new Set([
  "bind",
  "djmode",
  "help",
  "ping",
  "restart",
  "settings",
  "stats",
]);

const toCommandDefinition = (command: SlashCommand): CommandDefinition => {
  return command.data.toJSON() as CommandDefinition;
};

const compareCommands = (left: SlashCommand, right: SlashCommand): number => {
  return toCommandDefinition(left).name.localeCompare(toCommandDefinition(right).name);
};

const getCommandCategory = (commandName: string): string => {
  return adminCommandNames.has(commandName) ? "Server & info" : "Playback";
};

const formatOptionToken = (option: CommandOptionDefinition): string => {
  return option.required ? `<${option.name}>` : `[${option.name}]`;
};

const isSubcommandOption = (option: CommandOptionDefinition): boolean => {
  return option.type === ApplicationCommandOptionType.Subcommand;
};

const isSubcommandGroupOption = (option: CommandOptionDefinition): boolean => {
  return option.type === ApplicationCommandOptionType.SubcommandGroup;
};

const createUsageVariants = (
  commandName: string,
  options: readonly CommandOptionDefinition[] | undefined,
): readonly string[] => {
  if (!options || options.length === 0) {
    return [`/${commandName}`];
  }

  if (options.some(isSubcommandGroupOption)) {
    return options.flatMap((groupOption) => {
      if (!isSubcommandGroupOption(groupOption)) {
        return [];
      }

      return createUsageVariants(`${commandName} ${groupOption.name}`, groupOption.options);
    });
  }

  if (options.some(isSubcommandOption)) {
    return options.flatMap((subcommandOption) => {
      if (!isSubcommandOption(subcommandOption)) {
        return [];
      }

      const suffix = subcommandOption.options?.map(formatOptionToken).join(" ") ?? "";
      return [
        `/${commandName} ${subcommandOption.name}${suffix.length > 0 ? ` ${suffix}` : ""}`,
      ];
    });
  }

  return [`/${commandName} ${options.map(formatOptionToken).join(" ")}`.trim()];
};

const formatCommandUsage = (definition: CommandDefinition): string => {
  return createUsageVariants(definition.name, definition.options).join("\n");
};

const formatChoiceList = (option: CommandOptionDefinition): string | null => {
  if (!option.choices || option.choices.length === 0) {
    return null;
  }

  return option.choices.map((choice) => choice.name).join(", ");
};

const collectOptionDetails = (
  options: readonly CommandOptionDefinition[] | undefined,
  prefix = "",
): readonly string[] => {
  if (!options || options.length === 0) {
    return [];
  }

  return options.flatMap((option) => {
    if (isSubcommandGroupOption(option) || isSubcommandOption(option)) {
      const scopedName = prefix.length > 0 ? `${prefix} ${option.name}` : option.name;
      const heading = `- ${scopedName}: ${option.description}`;
      return [heading, ...collectOptionDetails(option.options, scopedName)];
    }

    const metadata = [option.required ? "required" : "optional"];

    if (option.autocomplete) {
      metadata.push("autocomplete");
    }

    const choices = formatChoiceList(option);

    if (choices) {
      metadata.push(`choices: ${choices}`);
    }

    const scopedName = prefix.length > 0 ? `${prefix} ${option.name}` : option.name;
    return [`- ${formatOptionToken(option)} ${scopedName}: ${option.description} (${metadata.join(", ")})`];
  });
};

const formatCommandSummary = (command: SlashCommand): string => {
  const definition = toCommandDefinition(command);
  return `${formatCommandUsage(definition)} - ${definition.description}`;
};

const createCommandOverviewView = (commands: readonly SlashCommand[]) => {
  const overviewCommands = [...commands].sort(compareCommands);
  const adminLines = overviewCommands
    .filter((command) => getCommandCategory(toCommandDefinition(command).name) === "Server & info")
    .map(formatCommandSummary);
  const playbackLines = overviewCommands
    .filter((command) => getCommandCategory(toCommandDefinition(command).name) === "Playback")
    .map(formatCommandSummary);
  const container = createContainer("brand").addTextDisplayComponents(
    createTextBlock("## Command Guide"),
    createTextBlock("Use `/help command:<name>` to open detailed usage for one command."),
  );

  container.addSeparatorComponents(createSeparator());
  container.addTextDisplayComponents(
    createTextBlock(
      [
        "**Quick start**",
        "- `/play <query>` starts playback and queues tracks.",
        "- `/queue` and `/nowplaying` show what the bot is doing.",
        "- `/skip`, `/pause`, `/resume`, and `/stop` cover the common controls.",
        "- `/bind`, `/djmode`, and `/settings` control server behavior.",
      ].join("\n"),
    ),
  );

  container.addSeparatorComponents(createSeparator());
  container.addTextDisplayComponents(
    createTextBlock(`**Playback**\n${playbackLines.join("\n")}`),
  );

  container.addSeparatorComponents(createSeparator());
  container.addTextDisplayComponents(
    createTextBlock(`**Server & info**\n${adminLines.join("\n")}`),
  );

  container.addSeparatorComponents(createSeparator());
  container.addTextDisplayComponents(createTextBlock(`Total commands: ${commands.length}`));

  return createDisplayPayload(container);
};

const createCommandDetailView = (command: SlashCommand) => {
  const definition = toCommandDefinition(command);
  const optionDetails = collectOptionDetails(definition.options);
  const requiredOptionCount = definition.options?.filter((option) => option.required).length ?? 0;
  const optionalOptionCount = (definition.options?.length ?? 0) - requiredOptionCount;
  const container = createContainer("brand").addTextDisplayComponents(
    createTextBlock(`## /${definition.name}`),
    createTextBlock(definition.description),
  );

  container.addSeparatorComponents(createSeparator());
  container.addTextDisplayComponents(
    createTextBlock(
      [
        `Category: ${getCommandCategory(definition.name)}`,
        `Usage: ${formatCommandUsage(definition)}`,
        `Options: ${requiredOptionCount} required, ${optionalOptionCount} optional`,
      ].join("\n"),
    ),
  );

  if (optionDetails.length > 0) {
    container.addSeparatorComponents(createSeparator());
    container.addTextDisplayComponents(
      createTextBlock(`**Options**\n${optionDetails.join("\n")}`),
    );
  }

  container.addSeparatorComponents(createSeparator());
  container.addTextDisplayComponents(
    createTextBlock("Use `/help` to return to the full command list."),
  );

  return createDisplayPayload(container);
};

export const helpCommand: SlashCommand = {
  autocomplete: async (interaction, context) => {
    const focusedValue = String(interaction.options.getFocused()).trim().toLowerCase();
    const choices = [...context.commands]
      .map((command) => toCommandDefinition(command).name)
      .sort((left, right) => left.localeCompare(right))
      .filter((commandName) => {
        if (focusedValue.length === 0) {
          return true;
        }

        return commandName.startsWith(focusedValue) || commandName.includes(focusedValue);
      })
      .slice(0, 25)
      .map((commandName) => ({
        name: commandName,
        value: commandName,
      }));

    await respondToAutocomplete(interaction, choices);
  },
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show a grouped command guide or inspect one command.")
    .addStringOption((option) =>
      option
        .setName("command")
        .setDescription("A specific command to inspect.")
        .setAutocomplete(true),
    ),
  async execute(interaction, context) {
    const requestedCommandName = interaction.options
      .getString("command")
      ?.trim()
      .toLowerCase();

    if (!requestedCommandName) {
      await respondToCommand(interaction, createCommandOverviewView(context.commands));
      return;
    }

    const requestedCommand = context.commands.find((command) => {
      return toCommandDefinition(command).name === requestedCommandName;
    });

    if (!requestedCommand) {
      await respondWithCommandError(
        interaction,
        `I couldn't find a command named /${requestedCommandName}.`,
      );
      return;
    }

    await respondToCommand(interaction, createCommandDetailView(requestedCommand));
  },
};