import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "./jwt.js";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string };
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.header("authorization") ?? req.header("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "missing or malformed Authorization header" });
    return;
  }
  const token = header.slice(7).trim();
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
