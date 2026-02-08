import { ErrorHandler } from "hono";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";

export const errorHandler: ErrorHandler = (err, c) => {
  console.error("Error:", err);
  console.error("Path:", c.req.path);
  console.error("Method:", c.req.method);

  if (err instanceof CustomError) {
    const statusCode =
      {
        [ErrorCode.UNAUTHORIZED]: 401,
        [ErrorCode.PERMISSION_DENIED]: 403,
        [ErrorCode.NOT_FOUND]: 404,
        [ErrorCode.CONFLICT]: 409,
        [ErrorCode.VALIDATION_ERROR]: 400,
        [ErrorCode.UNEXPECTED_ERROR]: 500,
      }[err.code] || 500;

    return c.json({ error: err.message, code: err.code }, statusCode as any);
  }

  return c.json(
    {
      error: "Internal server error",
      message: err instanceof Error ? err.message : String(err),
    },
    500,
  );
};
