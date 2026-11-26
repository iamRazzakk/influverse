import { ZodError } from "zod";
import { IErrorMessage } from "../types/errors.types";

/** Audit #18: this used to be a copy of the mongoose handler. Now maps Zod issues → `{ path, message }`. */
const handleZodError = (error: ZodError) => {
  const errorMessages: IErrorMessage[] = error.issues.map((issue) => ({
    // validateRequest wraps `{ body, query, params }` — drop the first segment: "body.email" → "email"
    path: (["body", "query", "params", "cookies"].includes(String(issue.path[0]))
      ? issue.path.slice(1)
      : issue.path
    ).join("."),
    message: issue.message,
  }));

  return {
    statusCode: 400,
    message: "Validation Error",
    errorMessages,
  };
};

export default handleZodError;
