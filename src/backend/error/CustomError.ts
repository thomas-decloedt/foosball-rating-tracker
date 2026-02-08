import type { ZodIssue } from "zod";

import { ErrorCode } from "./ErrorCodes";

export class CustomError extends Error {
  code: ErrorCode;
  validation?: ZodIssue[];

  constructor(message: string, code: ErrorCode) {
    super(message);
    this.code = code;
    this.name = "CustomError";
  }
}
