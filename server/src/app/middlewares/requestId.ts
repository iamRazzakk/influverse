import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

const HEADER = "x-request-id";
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Gives every request an id that appears in logs, error responses and client bug reports. */
const requestId = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header(HEADER);
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(HEADER, req.id);
  next();
};

export default requestId;
