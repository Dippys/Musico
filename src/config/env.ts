import { config as loadDotenv } from "dotenv";
import type { ZodError } from "zod";

import { envSchema, type AppEnv } from "./schema.js";

const envKeys = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "LAVALINK_NODES",
  "DEFAULT_VOLUME",
  "INACTIVITY_TIMEOUT_MS",
  "LOG_LEVEL",
  "BOT_OWNER_IDS",
] as const;

type EnvKey = (typeof envKeys)[number];
type RawEnv = Record<EnvKey, string | undefined>;

let cachedEnv: AppEnv | undefined;

export class EnvValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

const pickEnv = (source: NodeJS.ProcessEnv): RawEnv => {
  return envKeys.reduce<RawEnv>((selected, key) => {
    selected[key] = source[key];
    return selected;
  }, {} as RawEnv);
};

const formatIssuePath = (path: PropertyKey[]): string => {
  if (path.length === 0) {
    return "env";
  }

  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${segment}]`;
    }

    if (typeof segment === "symbol") {
      const symbolValue = segment.description ?? segment.toString();
      return formatted.length === 0
        ? symbolValue
        : `${formatted}.${symbolValue}`;
    }

    return formatted.length === 0 ? segment : `${formatted}.${segment}`;
  }, "");
};

const formatZodError = (error: ZodError): string => {
  const issues = error.issues
    .map((issue) => `- ${formatIssuePath(issue.path)}: ${issue.message}`)
    .join("\n");

  return `Invalid environment configuration:\n${issues}`;
};

export const parseEnv = (source: NodeJS.ProcessEnv): AppEnv => {
  const result = envSchema.safeParse(pickEnv(source));

  if (!result.success) {
    throw new EnvValidationError(formatZodError(result.error));
  }

  return result.data;
};

export const loadEnv = (): AppEnv => {
  if (cachedEnv) {
    return cachedEnv;
  }

  loadDotenv();
  cachedEnv = parseEnv(process.env);

  return cachedEnv;
};