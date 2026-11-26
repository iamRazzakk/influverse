import { Response } from "express";

/** `meta` for list responses (docs/00-final-plan.md §5 conventions). Cursor lists use `nextCursor`. */
export type IMeta = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  nextCursor?: string | null;
  [key: string]: unknown;
};

type IData<T> = {
  success?: boolean;
  statusCode: number;
  message?: string;
  meta?: IMeta;
  data?: T;
};

/** Shape: `{ success, message, data, meta? }` */
const sendResponse = <T>(res: Response, payload: IData<T>) => {
  res.status(payload.statusCode).json({
    success: payload.success ?? payload.statusCode < 400,
    message: payload.message,
    data: payload.data,
    ...(payload.meta ? { meta: payload.meta } : {}),
  });
};

export default sendResponse;
