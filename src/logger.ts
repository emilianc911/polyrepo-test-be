import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.logLevel,
  base: { env: config.env },
  timestamp: pino.stdTimeFunctions.isoTime,
});
