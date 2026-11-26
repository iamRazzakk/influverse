import { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { StatusCodes } from "http-status-codes";
import config from "../../config";
import ApiError from "../../errors/ApiErrors";
import handleValidationError from "../../errors/handleValidationError";
import handleZodError from "../../errors/handleZodError";
import { errorLogger } from "../../shared/logger";
import { IErrorMessage } from "../../types/errors.types";

type Simplified = { statusCode: number; message: string; errorMessages: IErrorMessage[] };

const single = (statusCode: number, message: string, path = ""): Simplified => ({
  statusCode,
  message,
  errorMessages: [{ path, message }],
});

const simplify = (error: any): Simplified => {
  if (error instanceof ZodError) return handleZodError(error);
  if (error instanceof mongoose.Error.ValidationError) return handleValidationError(error);
  if (error instanceof mongoose.Error.CastError) {
    return single(StatusCodes.BAD_REQUEST, `Invalid ${error.path}`, error.path);
  }
  // Mongo duplicate key (unique index)
  if (error?.code === 11000) {
    const field = Object.keys(error.keyValue ?? error.keyPattern ?? {})[0] ?? "";
    return single(StatusCodes.CONFLICT, `${field || "Value"} already exists`, field);
  }
  if (error?.name === "TokenExpiredError") {
    return single(StatusCodes.UNAUTHORIZED, "Session expired. Please log in again.");
  }
  if (error?.name === "JsonWebTokenError") {
    return single(StatusCodes.UNAUTHORIZED, "Invalid token. Please log in again.");
  }
  // express.json() malformed body
  if (error?.type === "entity.parse.failed") {
    return single(StatusCodes.BAD_REQUEST, "Malformed JSON body");
  }
  if (error?.type === "entity.too.large") {
    return single(StatusCodes.REQUEST_TOO_LONG, "Request body too large");
  }
  if (error instanceof ApiError) return single(error.statusCode, error.message);

  // Unknown → 500. Never leak internal messages in production.
  return single(
    StatusCodes.INTERNAL_SERVER_ERROR,
    config.isProd ? "Something went wrong" : error?.message || "Something went wrong",
  );
};

const globalErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const { statusCode, message, errorMessages } = simplify(error);

  if (statusCode >= 500) {
    errorLogger.error(`[${req.id}] ${req.method} ${req.originalUrl} → ${error?.message}`, {
      stack: error?.stack,
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorMessages,
    requestId: req.id,
    stack: config.isProd ? undefined : error?.stack,
  });
};

export default globalErrorHandler;
