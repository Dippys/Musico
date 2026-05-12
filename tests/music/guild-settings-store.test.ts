import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  GuildSettingsStore,
  defaultGuildSettings,
} from "../../src/music/GuildSettingsStore.js";

const createStorePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "musico-settings-"));
  return join(directory, "guild-settings.json");
};

describe("GuildSettingsStore", () => {
  it("returns defaults when the settings file is missing", async () => {
    const filePath = await createStorePath();
    const store = new GuildSettingsStore({ filePath });

    expect(store.getSnapshot("guild-1")).toEqual({
      defaults: {
        autoplayMode: true,
        boundTextChannelId: true,
        djModeEnabled: true,
        twentyFourSevenEnabled: true,
      },
      guildId: "guild-1",
      hasStoredSettings: false,
      settings: defaultGuildSettings,
      storageState: "missing",
    });
  });

  it("persists updates and reloads them from disk", async () => {
    const filePath = await createStorePath();
    const store = new GuildSettingsStore({ filePath });

    await store.update("guild-1", {
      autoplayMode: "related",
      boundTextChannelId: "345678901234567890",
      djModeEnabled: true,
      twentyFourSevenEnabled: true,
    });

    const reloadedStore = new GuildSettingsStore({ filePath });

    expect(reloadedStore.getSnapshot("guild-1")).toEqual({
      defaults: {
        autoplayMode: false,
        boundTextChannelId: false,
        djModeEnabled: false,
        twentyFourSevenEnabled: false,
      },
      guildId: "guild-1",
      hasStoredSettings: true,
      settings: {
        autoplayMode: "related",
        boundTextChannelId: "345678901234567890",
        djModeEnabled: true,
        twentyFourSevenEnabled: true,
      },
      storageState: "loaded",
    });

    const contents = await readFile(filePath, "utf8");

    expect(contents).toContain('"version": 1');
    expect(contents).toContain('"autoplayMode": "related"');
  });

  it("falls back to defaults when the file is malformed and rewrites valid JSON on update", async () => {
    const filePath = await createStorePath();

    await writeFile(filePath, "{not valid json", "utf8");

    const store = new GuildSettingsStore({ filePath });

    expect(store.getSnapshot("guild-1")).toEqual({
      defaults: {
        autoplayMode: true,
        boundTextChannelId: true,
        djModeEnabled: true,
        twentyFourSevenEnabled: true,
      },
      guildId: "guild-1",
      hasStoredSettings: false,
      settings: defaultGuildSettings,
      storageState: "invalid",
    });

    await store.update("guild-1", {
      djModeEnabled: true,
    });

    const contents = await readFile(filePath, "utf8");

    expect(() => JSON.parse(contents)).not.toThrow();
    expect(contents).toContain('"djModeEnabled": true');
  });

  it("drops default-valued settings from the persisted file", async () => {
    const filePath = await createStorePath();
    const store = new GuildSettingsStore({ filePath });

    await store.update("guild-1", {
      autoplayMode: "related",
      djModeEnabled: true,
    });
    await store.update("guild-1", {
      autoplayMode: "off",
      djModeEnabled: false,
    });

    const contents = await readFile(filePath, "utf8");

    expect(contents).not.toContain('"autoplayMode"');
    expect(contents).not.toContain('"djModeEnabled"');
    expect(store.getSnapshot("guild-1").hasStoredSettings).toBe(false);
  });
});