import path from "path";
import { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

// NOTE: config is not imported here (config → logger would be circular), so process.env is read directly.
const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

const { combine, timestamp, label, printf, json, errors, colorize } = format;

const devFormat = printf(({ level, message, label, timestamp, stack }) => {
  return `${timestamp} [${label}] ${level}: ${stack ?? message}`;
});

const baseFormat = combine(label({ label: "INFLUVERSE" }), timestamp(), errors({ stack: true }));

const consoleTransport = new transports.Console({
  silent: isTest,
  format: isProd ? combine(baseFormat, json()) : combine(baseFormat, colorize(), devFormat),
});

const fileTransport = (kind: "success" | "error") =>
  new DailyRotateFile({
    filename: path.join(process.cwd(), "winston", kind, `%DATE%-${kind}.log`),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "14d",
    format: combine(baseFormat, json()),
  });

const logger = createLogger({
  level: isProd ? "info" : process.env.LOG_LEVEL || "debug",
  transports: isTest ? [consoleTransport] : [consoleTransport, fileTransport("success")],
});

const errorLogger = createLogger({
  level: "error",
  transports: isTest ? [consoleTransport] : [consoleTransport, fileTransport("error")],
});

export { errorLogger, logger };
