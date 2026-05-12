import pino from "pino";
import type { Logger, LoggerOptions } from "pino";

import type { LogLevel } from "../config/schema.js";

const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  name: "musico",
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger: Logger = pino(loggerOptions);

export const configureLogger = (level: LogLevel): void => {
  logger.level = level;
};