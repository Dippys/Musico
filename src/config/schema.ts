import { z } from "zod";

const emptyStringToUndefined = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const snowflakeSchema = z
  .string()
  .regex(/^\d{17,20}$/, "must be a Discord snowflake");

const integerFromEnv = (key: string) =>
  z.string().trim().min(1, `${key} is required`).transform((value, ctx) => {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${key} must be an integer`,
      });

      return z.NEVER;
    }

    return parsed;
  });

const optionalSnowflake = z.preprocess(
  emptyStringToUndefined,
  snowflakeSchema.optional(),
);

const isValidLavalinkUrl = (value: string): boolean => {
  const candidate = value.includes("://") ? value : `http://${value}`;

  try {
    const parsed = new URL(candidate);
    return parsed.hostname.length > 0 && parsed.port.length > 0;
  } catch {
    return false;
  }
};

const lavalinkNodeSchema = z
  .object({
    name: z.string().trim().min(1, "Each Lavalink node needs a name"),
    url: z
      .string()
      .trim()
      .min(1, "Each Lavalink node needs a url")
      .refine(
        isValidLavalinkUrl,
        "Each Lavalink node url must be host:port or a ws(s) URL",
      ),
    auth: z.string().trim().min(1, "Each Lavalink node needs an auth value"),
    secure: z.boolean().optional().default(false),
    group: z.string().trim().min(1).optional(),
    resume: z.boolean().optional(),
    resumeTimeout: z.number().int().positive().optional(),
    reconnectTries: z.number().int().nonnegative().optional(),
    reconnectInterval: z.number().int().positive().optional(),
  })
  .strict();

const lavalinkNodesFromEnv = z
  .string()
  .trim()
  .min(1, "LAVALINK_NODES is required")
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LAVALINK_NODES must be valid JSON",
      });

      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(lavalinkNodeSchema)
      .min(1, "LAVALINK_NODES must contain at least one node"),
  );

const ownerIdsFromEnv = z
  .string()
  .trim()
  .min(1, "BOT_OWNER_IDS is required")
  .transform((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .pipe(
    z
      .array(snowflakeSchema)
      .min(1, "BOT_OWNER_IDS must contain at least one Discord snowflake"),
  );

export const logLevels = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

export type LogLevel = (typeof logLevels)[number];

export const envSchema = z
  .object({
    DISCORD_TOKEN: z.string().trim().min(1, "DISCORD_TOKEN is required"),
    DISCORD_CLIENT_ID: snowflakeSchema,
    DISCORD_GUILD_ID: optionalSnowflake,
    LAVALINK_NODES: lavalinkNodesFromEnv,
    DEFAULT_VOLUME: integerFromEnv("DEFAULT_VOLUME").pipe(
      z.number().int().min(0).max(200),
    ),
    INACTIVITY_TIMEOUT_MS: integerFromEnv("INACTIVITY_TIMEOUT_MS").pipe(
      z.number().int().min(1_000),
    ),
    LOG_LEVEL: z.enum(logLevels),
    BOT_OWNER_IDS: ownerIdsFromEnv,
  })
  .strict();

export type AppEnv = z.infer<typeof envSchema>;
export type LavalinkNodeConfig = AppEnv["LAVALINK_NODES"][number];