# Musico

Musico is a Discord music bot built with TypeScript, discord.js v14, and Shoukaku against Lavalink v4. The bot is slash-command only, uses Discord display components for the music UI, keeps playback state in memory, stores only guild playback settings in a local JSON file, and deliberately avoids both a database and a web panel.

## Features

- Slash-command playback and queue management
- Display-component now playing and queue views
- Search-result selection, queue paging, and seek modal flows
- Guild policies for DJ mode, bound channels, and 24/7 mode
- Guild-level serialized playback operations to resist command and button spam
- Inactivity auto-disconnect with 24/7 override handling
- Lavalink node health reporting, reconnect logging, and multi-node failover support
- Local JSON persistence for guild runtime settings only

## Requirements

- Node.js 20 or newer
- A Discord application with a bot token
- A Lavalink v4 server reachable from the bot
- Source plugins on the Lavalink side if you want reliable YouTube search and Spotify metadata resolution

## Quick Start

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `BOT_OWNER_IDS`, and your Lavalink node JSON.
4. Start Lavalink.
5. Deploy slash commands with `npm run deploy-commands`.
6. Start the bot with `npm run dev` for development or `npm run build` followed by `npm run start` for a production-style run.

## Environment Notes

- `DISCORD_GUILD_ID` is optional for the bot process, but required by `npm run deploy-commands` when you are not deploying globally in production.
- `LAVALINK_NODES` must be valid JSON. The bot accepts multiple nodes and enables Shoukaku failover when more than one node is configured.
- `BOT_OWNER_IDS` is a comma-separated list of Discord user IDs that bypass DJ mode restrictions.

## Lavalink Plugin Notes

Modern music bots typically need Lavalink plugins for reliable search and source coverage. The included compose stack mounts [docker/lavalink/application.yml](docker/lavalink/application.yml), which:

- disables Lavalink's deprecated built-in YouTube source
- enables `youtube-plugin` for `ytsearch:` and `ytmsearch:` support
- enables LavaSrc for mirrored-source resolution defaults without requiring extra bot env configuration

If search queries fail while direct URLs still work, your Lavalink node is usually missing a source plugin or has an outdated plugin configuration.

## Docker

`Dockerfile` builds the bot into a small multi-stage Node 20 image. `docker-compose.yml` brings up both the bot and a local Lavalink node for integration testing.

### Local Compose Stack

1. Populate `.env` with your Discord credentials and bot owner IDs.
2. Run `docker compose up --build`.
3. Deploy commands from your host shell with `npm run deploy-commands`, or exec into the bot container to run it there.

The compose file overrides `LAVALINK_NODES` so the bot automatically targets the local `lavalink` service on the Docker network.

## Commands

### Admin

- `/bind`
- `/djmode`
- `/help`
- `/ping`
- `/settings`
- `/stats`

### Music

- `/247`
- `/autoplay`
- `/clear`
- `/filter`
- `/join`
- `/leave`
- `/move`
- `/nowplaying`
- `/pause`
- `/play`
- `/playnext`
- `/queue`
- `/remove`
- `/repeat`
- `/resume`
- `/seek`
- `/shuffle`
- `/skip`
- `/skipto`
- `/stop`
- `/volume`

## Runtime Policies

- DJ mode restricts playback-changing actions to bot owners and members with elevated guild or voice management permissions.
- Bound channel mode restricts music commands and music component interactions to the configured text channel.
- The bot auto-disconnects after `INACTIVITY_TIMEOUT_MS` when playback is idle, unless 24/7 mode is enabled.
- Deleted text channels, deleted tracked messages, and missing channel access are treated as recoverable runtime warnings instead of process-fatal errors.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run deploy-commands`

## Validation

Run the release validation set before shipping:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Troubleshooting

- Slash commands do not appear: confirm `DISCORD_CLIENT_ID`, optionally `DISCORD_GUILD_ID`, then rerun `npm run deploy-commands`.
- Playback says no Lavalink node is connected: verify the `LAVALINK_NODES` JSON, the Lavalink password, and that the node is reachable from the bot process.
- Search queries fail but URLs work: update the Lavalink plugin configuration and confirm the YouTube source plugin is enabled.
- The bot replies with a DJ or bound-channel error: check `/settings`, `/djmode`, and `/bind` for the active guild policy state.
- Spotify links resolve poorly: confirm LavaSrc is enabled on Lavalink and adjust the Lavalink plugin config directly if you intend to resolve Spotify metadata.