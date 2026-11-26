import { NextFunction, Request, Response } from "express";
import { AnyZodObject } from "zod";

/**
 * Schema shape: `z.object({ body?, query?, params?, cookies? })`.
 * Writes the parsed (coerced / transformed / defaulted / stripped) values back onto req —
 * previously it only validated, so controllers received the raw input.
 */
const validateRequest =
  (schema: AnyZodObject) => async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
        cookies: req.cookies,
      });
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.query !== undefined) req.query = parsed.query;
      if (parsed.params !== undefined) req.params = parsed.params;
      next();
    } catch (error) {
      next(error);
    }
  };

export default validateRequest;
