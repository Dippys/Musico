import type { Client } from "discord.js";
import {
  Connectors,
  Shoukaku,
  type Node,
  type NodeOption,
  type Player,
  type ShoukakuOptions,
  type Stats,
  type VoiceChannelOptions,
} from "shoukaku";

import type { AppEnv, LavalinkNodeConfig } from "../config/schema.js";
import { logger } from "../logging/logger.js";

type SharedOptionKey =
  | "reconnectInterval"
  | "reconnectTries"
  | "resume"
  | "resumeTimeout";

export type LavalinkNodeConnectionState =
  | "connected"
  | "connecting"
  | "disconnected"
  | "disconnecting";

export interface LavalinkNodeSnapshot {
  group: string | null;
  name: string;
  reconnects: number;
  state: LavalinkNodeConnectionState;
  stats: {
    cpuLoad: number;
    frameDeficit: number | null;
    frameNulled: number | null;
    frameSent: number | null;
    memoryAllocated: number;
    memoryFree: number;
    memoryUsed: number;
    players: number;
    playingPlayers: number;
    uptimeMs: number;
  } | null;
  version: string | null;
}

export interface LavalinkHealthSnapshot {
  activePlayerCount: number;
  configuredNodeCount: number;
  connectedNodeCount: number;
  idealNodeName: string | null;
  moveOnDisconnect: boolean;
  nodes: readonly LavalinkNodeSnapshot[];
}

export class LavalinkConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "LavalinkConfigError";
  }
}

const toNodeOptions = (nodes: readonly LavalinkNodeConfig[]): NodeOption[] => {
  return nodes.map((node) => ({
    auth: node.auth,
    name: node.name,
    secure: node.secure,
    url: node.url,
    ...(node.group ? { group: node.group } : {}),
  }));
};

const extractSharedOption = <K extends SharedOptionKey>(
  nodes: readonly LavalinkNodeConfig[],
  key: K,
): LavalinkNodeConfig[K] | undefined => {
  const values = [
    ...new Set(
      nodes
        .map((node) => node[key])
        .filter((value): value is NonNullable<LavalinkNodeConfig[K]> => {
          return value !== undefined;
        }),
    ),
  ];

  if (values.length > 1) {
    throw new LavalinkConfigError(
      `LAVALINK_NODES contains conflicting ${key} values. Shoukaku applies ${key} globally, so every node must use the same value.`,
    );
  }

  return values[0];
};

const toShoukakuOptions = (
  nodes: readonly LavalinkNodeConfig[],
): ShoukakuOptions => {
  const options: ShoukakuOptions = {};

  options.moveOnDisconnect = nodes.length > 1;

  const reconnectInterval = extractSharedOption(nodes, "reconnectInterval");

  if (reconnectInterval !== undefined) {
    options.reconnectInterval = reconnectInterval;
  }

  const reconnectTries = extractSharedOption(nodes, "reconnectTries");

  if (reconnectTries !== undefined) {
    options.reconnectTries = reconnectTries;
  }

  const resume = extractSharedOption(nodes, "resume");

  if (resume !== undefined) {
    options.resume = resume;
  }

  const resumeTimeout = extractSharedOption(nodes, "resumeTimeout");

  if (resumeTimeout !== undefined) {
    options.resumeTimeout = resumeTimeout;
  }

  return options;
};

const toConnectionState = (state: number): LavalinkNodeConnectionState => {
  switch (state) {
    case 0:
      return "connecting";
    case 1:
      return "connected";
    case 2:
      return "disconnecting";
    default:
      return "disconnected";
  }
};

const toNodeStatsSnapshot = (stats: Stats | null) => {
  if (!stats) {
    return null;
  }

  return {
    cpuLoad: stats.cpu.lavalinkLoad,
    frameDeficit: stats.frameStats?.deficit ?? null,
    frameNulled: stats.frameStats?.nulled ?? null,
    frameSent: stats.frameStats?.sent ?? null,
    memoryAllocated: stats.memory.allocated,
    memoryFree: stats.memory.free,
    memoryUsed: stats.memory.used,
    players: stats.players,
    playingPlayers: stats.playingPlayers,
    uptimeMs: stats.uptime,
  };
};

export class LavalinkService {
  private readonly manager: Shoukaku;

  private readonly configuredNodes: ReadonlyMap<string, { group: string | null }>;

  public constructor(client: Client, env: AppEnv) {
    const nodes = toNodeOptions(env.LAVALINK_NODES);
    const options = toShoukakuOptions(env.LAVALINK_NODES);

    this.manager = new Shoukaku(new Connectors.DiscordJS(client), nodes, options);
    this.configuredNodes = new Map(
      env.LAVALINK_NODES.map((node) => [
        node.name,
        { group: node.group ?? null },
      ]),
    );
    this.registerLifecycleLogs();

    logger.info(
      {
        lavalinkNodes: nodes.map((node) => node.name),
        moveOnDisconnect: options.moveOnDisconnect,
        reconnectInterval: options.reconnectInterval,
        reconnectTries: options.reconnectTries,
        resume: options.resume,
        resumeTimeout: options.resumeTimeout,
      },
      "Initialized Lavalink service.",
    );
  }

  public getIdealNode(): Node | undefined {
    return this.manager.getIdealNode();
  }

  public hasAvailableNode(): boolean {
    return this.getIdealNode() !== undefined;
  }

  public getPlayer(guildId: string): Player | undefined {
    return this.manager.players.get(guildId);
  }

  public async joinVoiceChannel(options: VoiceChannelOptions): Promise<Player> {
    return this.manager.joinVoiceChannel(options);
  }

  public async leaveVoiceChannel(guildId: string): Promise<void> {
    await this.manager.leaveVoiceChannel(guildId);
  }

  public getHealthSnapshot(): LavalinkHealthSnapshot {
    const nodes = [...this.configuredNodes.entries()].map(([name, config]) => {
      const node = this.manager.nodes.get(name);

      if (!node) {
        return {
          group: config.group,
          name,
          reconnects: 0,
          state: "disconnected",
          stats: null,
          version: null,
        } satisfies LavalinkNodeSnapshot;
      }

      return {
        group: node.group ?? config.group,
        name: node.name,
        reconnects: node.reconnects,
        state: toConnectionState(node.state),
        stats: toNodeStatsSnapshot(node.stats),
        version: node.info?.version.semver ?? null,
      } satisfies LavalinkNodeSnapshot;
    });

    return {
      activePlayerCount: this.manager.players.size,
      configuredNodeCount: this.configuredNodes.size,
      connectedNodeCount: nodes.filter((node) => node.state === "connected").length,
      idealNodeName: this.getIdealNode()?.name ?? null,
      moveOnDisconnect: this.manager.options.moveOnDisconnect,
      nodes,
    };
  }

  private registerLifecycleLogs(): void {
    this.manager.on("ready", (name, lavalinkResume, libraryResume) => {
      const health = this.getHealthSnapshot();

      logger.info(
        {
          connectedNodes: health.connectedNodeCount,
          configuredNodes: health.configuredNodeCount,
          idealNode: health.idealNodeName,
          libraryResume,
          lavalinkResume,
          node: name,
        },
        "Lavalink node is ready.",
      );
    });

    this.manager.on("error", (name, error) => {
      const health = this.getHealthSnapshot();

      logger.error(
        {
          connectedNodes: health.connectedNodeCount,
          err: error,
          idealNode: health.idealNodeName,
          moveOnDisconnect: health.moveOnDisconnect,
          node: name,
        },
        "Lavalink node emitted an error.",
      );
    });

    this.manager.on("close", (name, code, reason) => {
      const health = this.getHealthSnapshot();

      logger.warn(
        {
          code,
          connectedNodes: health.connectedNodeCount,
          idealNode: health.idealNodeName,
          moveOnDisconnect: health.moveOnDisconnect,
          node: name,
          reason,
        },
        "Lavalink node connection closed.",
      );
    });

    this.manager.on("disconnect", (name, movedPlayerCount) => {
      const health = this.getHealthSnapshot();

      logger.warn(
        {
          connectedNodes: health.connectedNodeCount,
          idealNode: health.idealNodeName,
          moveOnDisconnect: health.moveOnDisconnect,
          movedPlayerCount,
          node: name,
        },
        "Lavalink node disconnected.",
      );
    });

    this.manager.on("reconnecting", (name, reconnectsLeft, reconnectInterval) => {
      const health = this.getHealthSnapshot();

      logger.warn(
        {
          connectedNodes: health.connectedNodeCount,
          idealNode: health.idealNodeName,
          node: name,
          reconnectInterval,
          reconnectsLeft,
        },
        "Reconnecting Lavalink node.",
      );
    });

    this.manager.on("debug", (name, info) => {
      logger.debug({ info, node: name }, "Lavalink debug event.");
    });
  }
}