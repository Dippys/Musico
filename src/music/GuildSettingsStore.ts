import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { logger } from "../logging/logger.js";
import { autoplayModes, type AutoplayMode } from "./types.js";

export interface GuildSettings {
  autoplayMode: AutoplayMode;
  boundTextChannelId: string | null;
  djModeEnabled: boolean;
  twentyFourSevenEnabled: boolean;
}

export type GuildSettingKey = keyof GuildSettings;
export type GuildSettingsStorageState = "invalid" | "loaded" | "missing";

export interface GuildSettingsSnapshot {
  defaults: Record<GuildSettingKey, boolean>;
  guildId: string;
  hasStoredSettings: boolean;
  settings: GuildSettings;
  storageState: GuildSettingsStorageState;
}

export interface GuildSettingsStoreOptions {
  filePath?: string;
}

interface PersistedGuildSettings {
  autoplayMode?: AutoplayMode | undefined;
  boundTextChannelId?: string | null | undefined;
  djModeEnabled?: boolean | undefined;
  twentyFourSevenEnabled?: boolean | undefined;
}

const STORE_VERSION = 1 as const;

export const defaultGuildSettings: GuildSettings = {
  autoplayMode: "off",
  boundTextChannelId: null,
  djModeEnabled: false,
  twentyFourSevenEnabled: false,
};

const persistedGuildSettingsSchema = z
  .object({
    autoplayMode: z.enum(autoplayModes).optional(),
    boundTextChannelId: z.string().trim().min(1).nullable().optional(),
    djModeEnabled: z.boolean().optional(),
    twentyFourSevenEnabled: z.boolean().optional(),
  })
  .strict();

const persistedGuildSettingsFileSchema = z
  .object({
    guilds: z.record(z.string(), persistedGuildSettingsSchema).default({}),
    version: z.literal(STORE_VERSION),
  })
  .strict();

const createDefaultFlags = (
  persisted: PersistedGuildSettings | undefined,
): Record<GuildSettingKey, boolean> => {
  return {
    autoplayMode: persisted?.autoplayMode === undefined,
    boundTextChannelId: persisted?.boundTextChannelId === undefined,
    djModeEnabled: persisted?.djModeEnabled === undefined,
    twentyFourSevenEnabled: persisted?.twentyFourSevenEnabled === undefined,
  };
};

const normalizePersistedSettings = (
  settings: PersistedGuildSettings,
): PersistedGuildSettings => {
  const normalized: PersistedGuildSettings = {};

  if (
    settings.autoplayMode !== undefined &&
    settings.autoplayMode !== defaultGuildSettings.autoplayMode
  ) {
    normalized.autoplayMode = settings.autoplayMode;
  }

  if (
    settings.boundTextChannelId !== undefined &&
    settings.boundTextChannelId !== defaultGuildSettings.boundTextChannelId
  ) {
    normalized.boundTextChannelId = settings.boundTextChannelId;
  }

  if (
    settings.djModeEnabled !== undefined &&
    settings.djModeEnabled !== defaultGuildSettings.djModeEnabled
  ) {
    normalized.djModeEnabled = settings.djModeEnabled;
  }

  if (
    settings.twentyFourSevenEnabled !== undefined &&
    settings.twentyFourSevenEnabled !== defaultGuildSettings.twentyFourSevenEnabled
  ) {
    normalized.twentyFourSevenEnabled = settings.twentyFourSevenEnabled;
  }

  return normalized;
};

const mergePersistedSettings = (
  current: PersistedGuildSettings | undefined,
  patch: PersistedGuildSettings,
): PersistedGuildSettings => {
  const merged: PersistedGuildSettings = {
    ...(current ?? {}),
  };

  if (patch.autoplayMode !== undefined) {
    merged.autoplayMode = patch.autoplayMode;
  }

  if (patch.boundTextChannelId !== undefined) {
    merged.boundTextChannelId = patch.boundTextChannelId;
  }

  if (patch.djModeEnabled !== undefined) {
    merged.djModeEnabled = patch.djModeEnabled;
  }

  if (patch.twentyFourSevenEnabled !== undefined) {
    merged.twentyFourSevenEnabled = patch.twentyFourSevenEnabled;
  }

  return merged;
};

const orderPersistedSettings = (
  settings: PersistedGuildSettings,
): PersistedGuildSettings => {
  return {
    ...(settings.autoplayMode !== undefined
      ? { autoplayMode: settings.autoplayMode }
      : {}),
    ...(settings.boundTextChannelId !== undefined
      ? { boundTextChannelId: settings.boundTextChannelId }
      : {}),
    ...(settings.djModeEnabled !== undefined
      ? { djModeEnabled: settings.djModeEnabled }
      : {}),
    ...(settings.twentyFourSevenEnabled !== undefined
      ? { twentyFourSevenEnabled: settings.twentyFourSevenEnabled }
      : {}),
  };
};

const resolveGuildSettings = (
  persisted: PersistedGuildSettings | undefined,
): GuildSettings => {
  return {
    autoplayMode: persisted?.autoplayMode ?? defaultGuildSettings.autoplayMode,
    boundTextChannelId:
      persisted?.boundTextChannelId ?? defaultGuildSettings.boundTextChannelId,
    djModeEnabled:
      persisted?.djModeEnabled ?? defaultGuildSettings.djModeEnabled,
    twentyFourSevenEnabled:
      persisted?.twentyFourSevenEnabled ??
      defaultGuildSettings.twentyFourSevenEnabled,
  };
};

const isRenameFallbackError = (error: unknown): boolean => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return (
    error.code === "EEXIST" ||
    error.code === "EPERM" ||
    error.code === "ENOTEMPTY"
  );
};

export class GuildSettingsStore {
  private readonly filePath: string;

  private readonly guildSettings = new Map<string, PersistedGuildSettings>();

  private storageState: GuildSettingsStorageState = "missing";

  private writeChain: Promise<void> = Promise.resolve();

  public constructor(options: GuildSettingsStoreOptions = {}) {
    this.filePath = options.filePath ?? resolve(process.cwd(), "data", "guild-settings.json");
    this.loadFromDisk();
  }

  public getSnapshot(guildId: string): GuildSettingsSnapshot {
    const persisted = this.guildSettings.get(guildId);

    return {
      defaults: createDefaultFlags(persisted),
      guildId,
      hasStoredSettings: persisted !== undefined,
      settings: resolveGuildSettings(persisted),
      storageState: this.storageState,
    };
  }

  public async update(
    guildId: string,
    patch: PersistedGuildSettings,
  ): Promise<GuildSettingsSnapshot> {
    const parsedPatch = persistedGuildSettingsSchema.parse(patch);

    return this.runSerialized(async () => {
      const next = normalizePersistedSettings(
        mergePersistedSettings(this.guildSettings.get(guildId), parsedPatch),
      );

      if (Object.keys(next).length === 0) {
        this.guildSettings.delete(guildId);
      } else {
        this.guildSettings.set(guildId, next);
      }

      await this.persist();

      return this.getSnapshot(guildId);
    });
  }

  private loadFromDisk(): void {
    if (!existsSync(this.filePath)) {
      this.storageState = "missing";
      return;
    }

    try {
      const fileContents = readFileSync(this.filePath, "utf8");
      const parsedContents = persistedGuildSettingsFileSchema.parse(
        JSON.parse(fileContents) as unknown,
      );

      this.guildSettings.clear();

      for (const [guildId, settings] of Object.entries(parsedContents.guilds)) {
        const normalized = normalizePersistedSettings(settings);

        if (Object.keys(normalized).length === 0) {
          continue;
        }

        this.guildSettings.set(guildId, normalized);
      }

      this.storageState = "loaded";
    } catch (error) {
      this.guildSettings.clear();
      this.storageState = "invalid";

      logger.warn(
        {
          err: error,
          filePath: this.filePath,
        },
        "Failed to load guild settings from disk. Falling back to defaults.",
      );
    }
  }

  private serialize(): string {
    const guilds = Object.fromEntries(
      [...this.guildSettings.entries()]
        .sort(([leftGuildId], [rightGuildId]) => leftGuildId.localeCompare(rightGuildId))
        .map(([guildId, settings]) => [guildId, orderPersistedSettings(settings)]),
    );

    return `${JSON.stringify({ guilds, version: STORE_VERSION }, null, 2)}\n`;
  }

  private async persist(): Promise<void> {
    const contents = this.serialize();
    const directory = dirname(this.filePath);
    const tempPath = `${this.filePath}.tmp`;

    await mkdir(directory, { recursive: true });
    await writeFile(tempPath, contents, "utf8");

    try {
      await rename(tempPath, this.filePath);
    } catch (error) {
      if (!isRenameFallbackError(error)) {
        throw error;
      }

      await writeFile(this.filePath, contents, "utf8");
      await rm(tempPath, { force: true });
    }

    this.storageState = "loaded";
  }

  private runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(operation, operation);

    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }
}