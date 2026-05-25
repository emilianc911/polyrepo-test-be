import type { NextFunction, Request, RequestHandler, Response } from "express";

// Wrap async route handlers so thrown errors propagate to express's error
// middleware instead of crashing the process.
export function asyncHandler<R extends Request = Request>(
  fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as R, res, next)).catch(next);
  };
}
