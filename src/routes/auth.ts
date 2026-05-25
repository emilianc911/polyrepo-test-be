import { Router } from "express";
import { signToken } from "../auth/jwt.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/middleware.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { config } from "../config.js";
import { enqueue } from "../jobs/queue.js";
import { LoginSchema, RegisterSchema } from "../schemas/index.js";
import {
  createUser,
  findUserByEmail,
  findUserById,
  toPublicUser,
} from "../repositories/users.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { BadRequest, Conflict } from "../utils/errors.js";

export const authRouter = Router();

authRouter.post(
  "/auth/register",
  asyncHandler(async (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      throw BadRequest("invalid registration payload", parsed.error.flatten());
    }
    const { email, password, displayName } = parsed.data;
    const existing = await findUserByEmail(email);
    if (existing) throw Conflict("email already registered");

    const hash = await hashPassword(password);
    const user = await createUser({ email, displayName, passwordHash: hash });

    await enqueue({
      name: "send-welcome-email",
      data: { userId: user.id, email: user.email, displayName: user.display_name },
    });

    const token = signToken({ sub: user.id, email: user.email });
    res.status(201).json({
      user: toPublicUser(user),
      token,
      tokenTtlSeconds: config.auth.jwtTtlSeconds,
    });
  }),
);

authRouter.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw BadRequest("invalid login payload", parsed.error.flatten());
    }
    const { email, password } = parsed.data;
    const user = await findUserByEmail(email);
    if (!user) throw BadRequest("invalid credentials");
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) throw BadRequest("invalid credentials");

    const token = signToken({ sub: user.id, email: user.email });
    res.json({
      user: toPublicUser(user),
      token,
      tokenTtlSeconds: config.auth.jwtTtlSeconds,
    });
  }),
);

authRouter.get(
  "/auth/me",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await findUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: "user not found" });
      return;
    }
    res.json({ user: toPublicUser(user) });
  }),
);
