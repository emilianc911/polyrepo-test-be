import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface JwtPayload {
  sub: string; // user id
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtTtlSeconds,
  });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.auth.jwtSecret) as JwtPayload & {
    iat: number;
    exp: number;
  };
  return { sub: decoded.sub, email: decoded.email };
}
