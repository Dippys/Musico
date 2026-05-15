import type { AppEnv } from "../config/schema.js";
import type { DisplayMessageController } from "../music/DisplayMessageController.js";
import type { GuildSettingsStore } from "../music/GuildSettingsStore.js";
import type { GuildPlayerService } from "../music/GuildPlayerService.js";
import type { LavalinkService } from "../music/LavalinkService.js";
import type { LyricsMessageController } from "../music/LyricsMessageController.js";
import type { LyricsService } from "../music/LyricsService.js";
import type { TrackResolverService } from "../music/TrackResolverService.js";

import type { BotRegistry } from "./registry.js";

export interface BotMusicRuntimeContext {
  displayMessages: DisplayMessageController;
  guildSettings: GuildSettingsStore;
  guildPlayers: GuildPlayerService;
  lavalink: LavalinkService;
  lyrics: LyricsService;
  lyricsMessages: LyricsMessageController;
  trackResolver: TrackResolverService;
}

export interface BotRuntimeContext {
  env: AppEnv;
  music: BotMusicRuntimeContext;
  registry: BotRegistry;
}