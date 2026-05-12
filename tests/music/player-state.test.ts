import { ChannelType } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { GuildPlayerService } from "../../src/music/GuildPlayerService.js";

const baseEnv = {
  BOT_OWNER_IDS: ["123456789012345678"],
  DEFAULT_VOLUME: 100,
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_GUILD_ID: "234567890123456789",
  DISCORD_TOKEN: "discord-token",
  INACTIVITY_TIMEOUT_MS: 300000,
  LAVALINK_NODES: [
    {
      auth: "youshallnotpass",
      name: "main",
      secure: false,
      url: "localhost:2333",
    },
  ],
  LOG_LEVEL: "info",
} as const;

const createQueueItem = (id: string) => ({
  id,
  requestedAt: Date.now(),
  requestedById: "user-1",
  track: {
    artist: `Artist ${id}`,
    artworkUrl: null,
    encoded: `encoded-${id}`,
    identifier: `identifier-${id}`,
    isSeekable: true,
    isStream: false,
    isrc: null,
    lengthMs: 180000,
    pluginInfo: {},
    positionMs: 0,
    sourceName: "youtube",
    title: `Track ${id}`,
    uri: `https://example.com/${id}`,
  },
});

const createFakePlayer = () => {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();

  const player = {
    clearFilters: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    emit: (eventName: string, payload: unknown) => {
      for (const handler of handlers.get(eventName) ?? []) {
        handler(payload);
      }
    },
    on: vi.fn().mockImplementation((eventName: string, handler: (payload: unknown) => void) => {
      const listeners = handlers.get(eventName) ?? [];
      listeners.push(handler);
      handlers.set(eventName, listeners);
      return player;
    }),
    paused: false,
    position: 0,
    playTrack: vi.fn().mockImplementation(async () => {
      player.paused = false;
      player.position = 0;
    }),
    seekTo: vi.fn().mockImplementation(async (position: number) => {
      player.position = position;
    }),
    setFilters: vi.fn().mockResolvedValue(undefined),
    setGlobalVolume: vi.fn().mockImplementation(async (volume: number) => {
      player.volume = volume;
    }),
    setPaused: vi.fn().mockImplementation(async (paused = true) => {
      player.paused = paused;
    }),
    stopTrack: vi.fn().mockResolvedValue(undefined),
    volume: 100,
  };

  return player;
};

const createFakeLavalink = () => {
  const players = new Map<string, ReturnType<typeof createFakePlayer>>();

  return {
    hasAvailableNode: () => true,
    getIdealNode: () => ({ name: "main" }),
    getPlayer: (guildId: string) => players.get(guildId),
    joinVoiceChannel: vi.fn().mockImplementation(async (options: { guildId: string }) => {
      const existing = players.get(options.guildId);

      if (existing) {
        return existing;
      }

      const player = createFakePlayer();
      players.set(options.guildId, player);
      return player;
    }),
    leaveVoiceChannel: vi.fn().mockImplementation(async (guildId: string) => {
      players.delete(guildId);
    }),
  };
};

const createVoiceChannel = (guildId: string, channelId: string) => ({
  guild: {
    id: guildId,
    members: {
      fetchMe: vi.fn().mockResolvedValue({
        voice: {
          channel: null,
          channelId: null,
          setSuppressed: vi.fn().mockResolvedValue(undefined),
          suppress: false,
        },
      }),
      me: null,
    },
    shardId: 0,
  },
  id: channelId,
  type: ChannelType.GuildVoice,
});

describe("GuildPlayerService", () => {
  it("keeps a single player instance per guild", async () => {
    const lavalink = createFakeLavalink();
    const service = new GuildPlayerService(baseEnv, lavalink as never);
    const channel = createVoiceChannel("guild-1", "voice-1");

    await service.connect(channel as never);
    await service.connect(channel as never);

    expect(service.getPlayer("guild-1")).toBe(service.getPlayer("guild-1"));
    expect(service.getState("guild-1")?.textChannelId).toBe("voice-1");
    expect(service.getState("guild-1")?.voice.channelId).toBe("voice-1");
    expect(lavalink.joinVoiceChannel).toHaveBeenCalledTimes(2);
  });

  it("serializes operations per guild", async () => {
    const lavalink = createFakeLavalink();
    const service = new GuildPlayerService(baseEnv, lavalink as never);
    const order: string[] = [];

    let releaseFirst = (): void => {
      return undefined;
    };

    const firstStarted = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const firstOperation = service.runSerialized("guild-1", async () => {
      order.push("first:start");
      await firstStarted;
      order.push("first:end");
    });

    await Promise.resolve();

    const secondOperation = service.runSerialized("guild-1", async () => {
      order.push("second");
    });

    expect(order).toEqual(["first:start"]);

    releaseFirst();

    await Promise.all([firstOperation, secondOperation]);

    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("starts playback when the queue is idle and advances automatically on track end", async () => {
    const lavalink = createFakeLavalink();
    const service = new GuildPlayerService(baseEnv, lavalink as never);
    const channel = createVoiceChannel("guild-1", "voice-1");
    const first = createQueueItem("first");
    const second = createQueueItem("second");

    await service.connect(channel as never);
    await service.enqueue("guild-1", [first, second], { startIfIdle: true });

    const player = service.getPlayer("guild-1") as ReturnType<typeof createFakePlayer>;

    expect(player.playTrack).toHaveBeenNthCalledWith(1, {
      track: { encoded: "encoded-first" },
    });
    expect(service.getState("guild-1")?.currentItem?.id).toBe("first");

    player.emit("end", {
      reason: "finished",
      track: {
        info: {
          identifier: "identifier-first",
          title: "Track first",
        },
      },
    });

    await vi.waitFor(() => {
      expect(player.playTrack).toHaveBeenNthCalledWith(2, {
        track: { encoded: "encoded-second" },
      });
    });

    expect(service.getState("guild-1")?.currentItem?.id).toBe("second");
    expect(service.getState("guild-1")?.history.map((item) => item.id)).toEqual([
      "first",
    ]);
  });

  it("auto-disconnects after playback stays idle past the inactivity timeout", async () => {
    vi.useFakeTimers();

    try {
      const lavalink = createFakeLavalink();
      const service = new GuildPlayerService(
        {
          ...baseEnv,
          INACTIVITY_TIMEOUT_MS: 1_000,
        },
        lavalink as never,
      );
      const channel = createVoiceChannel("guild-1", "voice-1");
      const first = createQueueItem("first");

      await service.connect(channel as never);
      await service.enqueue("guild-1", [first], { startIfIdle: true });

      const player = service.getPlayer("guild-1") as ReturnType<typeof createFakePlayer>;

      player.emit("end", {
        reason: "finished",
        track: {
          info: {
            identifier: "identifier-first",
            title: "Track first",
          },
        },
      });

      await vi.advanceTimersByTimeAsync(1_000);

      expect(lavalink.leaveVoiceChannel).toHaveBeenCalledWith("guild-1");
      expect(service.getState("guild-1")?.voice.channelId).toBeNull();
      expect(service.getState("guild-1")?.voice.status).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the voice connection alive when 24/7 mode is enabled", async () => {
    vi.useFakeTimers();

    try {
      const lavalink = createFakeLavalink();
      const service = new GuildPlayerService(
        {
          ...baseEnv,
          INACTIVITY_TIMEOUT_MS: 1_000,
        },
        lavalink as never,
        {
          getSnapshot: vi.fn().mockReturnValue({
            settings: {
              twentyFourSevenEnabled: true,
            },
          }),
        } as never,
      );
      const channel = createVoiceChannel("guild-1", "voice-1");

      await service.connect(channel as never);
      await vi.advanceTimersByTimeAsync(1_000);

      expect(lavalink.leaveVoiceChannel).not.toHaveBeenCalled();
      expect(service.getState("guild-1")?.voice.channelId).toBe("voice-1");
      expect(service.getState("guild-1")?.voice.status).toBe("connected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses, resumes, skips, and stops without desynchronizing queue state", async () => {
    const lavalink = createFakeLavalink();
    const service = new GuildPlayerService(baseEnv, lavalink as never);
    const channel = createVoiceChannel("guild-1", "voice-1");
    const first = createQueueItem("first");
    const second = createQueueItem("second");

    await service.connect(channel as never);
    await service.enqueue("guild-1", [first, second], { startIfIdle: true });

    await service.pause("guild-1");
    expect(service.getState("guild-1")?.paused).toBe(true);
    expect(service.getPlayer("guild-1")?.setPaused).toHaveBeenCalledWith(true);

    await service.resume("guild-1");
    expect(service.getState("guild-1")?.paused).toBe(false);
    expect(service.getPlayer("guild-1")?.setPaused).toHaveBeenCalledWith(false);

    await service.skip("guild-1");
    expect(service.getState("guild-1")?.currentItem?.id).toBe("second");
    expect(service.getState("guild-1")?.history.map((item) => item.id)).toEqual([
      "first",
    ]);

    await service.stop("guild-1");
    expect(service.getPlayer("guild-1")?.stopTrack).toHaveBeenCalledTimes(1);
    expect(service.getState("guild-1")?.currentItem).toBeNull();
    expect(service.getState("guild-1")?.queue).toEqual([]);
  });

  it("returns to the previous track and can restart the current track", async () => {
    const lavalink = createFakeLavalink();
    const service = new GuildPlayerService(baseEnv, lavalink as never);
    const channel = createVoiceChannel("guild-1", "voice-1");
    const first = createQueueItem("first");
    const second = createQueueItem("second");

    await service.connect(channel as never);
    await service.enqueue("guild-1", [first, second], { startIfIdle: true });
    await service.skip("guild-1");

    const player = service.getPlayer("guild-1") as ReturnType<typeof createFakePlayer>;
    const previousState = await service.previous("guild-1");

    expect(player.playTrack).toHaveBeenNthCalledWith(3, {
      track: { encoded: "encoded-first" },
    });
    expect(previousState?.currentItem?.id).toBe("first");
    expect(previousState?.queue.map((item) => item.id)).toEqual(["second"]);

    player.position = 12_000;

    const restartedState = await service.previous("guild-1");

    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(restartedState?.currentItem?.id).toBe("first");
    expect(restartedState?.playbackPositionMs).toBe(0);
  });

  it("shuffles the queued items and cycles repeat mode", async () => {
    const lavalink = createFakeLavalink();
    const service = new GuildPlayerService(baseEnv, lavalink as never);
    const channel = createVoiceChannel("guild-1", "voice-1");
    const first = createQueueItem("first");
    const second = createQueueItem("second");
    const third = createQueueItem("third");

    await service.connect(channel as never);
    await service.enqueue("guild-1", [first, second, third], { startIfIdle: true });

    const originalRandom = Math.random;
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    try {
      const shuffled = await service.shuffle("guild-1");

      expect(shuffled?.queue.map((item) => item.id)).toEqual(["third", "second"]);
    } finally {
      Math.random = originalRandom;
      vi.restoreAllMocks();
    }

    expect((await service.cycleRepeatMode("guild-1"))?.repeatMode).toBe("track");
    expect((await service.cycleRepeatMode("guild-1"))?.repeatMode).toBe("queue");
    expect((await service.cycleRepeatMode("guild-1"))?.repeatMode).toBe("off");
  });

  it("supports advanced queue and player control mutations", async () => {
    const lavalink = createFakeLavalink();
    const service = new GuildPlayerService(baseEnv, lavalink as never);
    const channel = createVoiceChannel("guild-1", "voice-1");
    const first = createQueueItem("first");
    const second = createQueueItem("second");
    const third = createQueueItem("third");
    const fourth = createQueueItem("fourth");

    await service.connect(channel as never);
    await service.enqueue("guild-1", [first, second, third, fourth], {
      startIfIdle: true,
    });

    expect((await service.moveQueueItem("guild-1", 2, 0))?.moved).toBe(true);
    expect(service.getState("guild-1")?.queue.map((item) => item.id)).toEqual([
      "fourth",
      "second",
      "third",
    ]);

    expect((await service.removeFromQueue("guild-1", 1))?.removedItem?.id).toBe(
      "second",
    );
    expect(service.getState("guild-1")?.queue.map((item) => item.id)).toEqual([
      "fourth",
      "third",
    ]);

    const skipToResult = await service.skipToQueuePosition("guild-1", 1);

    expect(skipToResult?.skippedItems.map((item) => item.id)).toEqual(["fourth"]);
    expect(skipToResult?.startedItem?.id).toBe("third");
    expect(service.getState("guild-1")?.currentItem?.id).toBe("third");

    const player = service.getPlayer("guild-1") as ReturnType<typeof createFakePlayer>;

    await service.seek("guild-1", 45_000);
    expect(player.seekTo).toHaveBeenCalledWith(45_000);
    expect(service.getState("guild-1")?.playbackPositionMs).toBe(45_000);

    await service.setVolume("guild-1", 65);
    expect(player.setGlobalVolume).toHaveBeenCalledWith(65);
    expect(service.getState("guild-1")?.volume).toBe(65);

    await service.setAutoplayMode("guild-1", "related");
    expect(service.getState("guild-1")?.autoplayMode).toBe("related");

    await service.setRepeatMode("guild-1", "queue");
    expect(service.getState("guild-1")?.repeatMode).toBe("queue");

    await service.applyFilterPreset("guild-1", "nightcore");
    expect(player.setFilters).toHaveBeenCalled();
    expect(service.getState("guild-1")?.filterPreset).toBe("nightcore");

    await service.applyFilterPreset("guild-1", "off");
    expect(player.clearFilters).toHaveBeenCalledTimes(2);
    expect(service.getState("guild-1")?.filterPreset).toBe("off");

    const cleared = await service.clearQueue("guild-1");

    expect(cleared?.clearedItems.map((item) => item.id)).toEqual([]);
    expect(service.getState("guild-1")?.queue).toEqual([]);
  });

  it("notifies listeners when guild player state changes", async () => {
    const lavalink = createFakeLavalink();
    const service = new GuildPlayerService(baseEnv, lavalink as never);
    const channel = createVoiceChannel("guild-1", "voice-1");
    const listener = vi.fn();
    const unsubscribe = service.onStateChange(listener);

    await service.connect(channel as never);
    await service.enqueue("guild-1", [createQueueItem("first")], {
      startIfIdle: true,
    });

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled();
    });

    unsubscribe();
    listener.mockClear();

    await service.stop("guild-1");

    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
  });
});