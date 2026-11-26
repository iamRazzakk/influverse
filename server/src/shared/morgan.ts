import { Request, Response } from "express";
import morgan from "morgan";
import { errorLogger, logger } from "./logger";

morgan.token("id", (req: Request) => req.id);

// Don't log IPs (PII); the request id correlates errors with logs
const format = ":id :method :url :status - :response-time ms";

const successHandler = morgan(format, {
  skip: (_req: Request, res: Response) => res.statusCode >= 400,
  stream: { write: (message: string) => logger.info(message.trim()) },
});

const errorHandler = morgan(format, {
  skip: (_req: Request, res: Response) => res.statusCode < 400,
  stream: { write: (message: string) => errorLogger.error(message.trim()) },
});

export const Morgan = { successHandler, errorHandler };
