import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../auth/middleware.js";
import {
  CreateProjectSchema,
  UpdateProjectSchema,
} from "../schemas/index.js";
import {
  createProject,
  deleteProject,
  findProject,
  listProjectsForUser,
  updateProject,
} from "../repositories/projects.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { BadRequest, NotFound } from "../utils/errors.js";
import { publishEvent } from "../ws/server.js";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get(
  "/projects",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const projects = await listProjectsForUser(req.user!.id);
    res.json({ projects });
  }),
);

projectsRouter.get(
  "/projects/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await findProject(req.params.id!, req.user!.id);
    if (!project) throw NotFound("project not found");
    res.json({ project });
  }),
);

projectsRouter.post(
  "/projects",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw BadRequest("invalid project payload", parsed.error.flatten());
    }
    const project = await createProject({
      ownerId: req.user!.id,
      name: parsed.data.name,
      description: parsed.data.description,
    });
    res.status(201).json({ project });
  }),
);

projectsRouter.patch(
  "/projects/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = UpdateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw BadRequest("invalid project payload", parsed.error.flatten());
    }
    const project = await updateProject({
      id: req.params.id!,
      ownerId: req.user!.id,
      patch: parsed.data,
    });
    if (!project) throw NotFound("project not found");
    await publishEvent({
      type: "project.updated",
      projectId: project.id,
      payload: { project },
    });
    res.json({ project });
  }),
);

projectsRouter.delete(
  "/projects/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ok = await deleteProject(req.params.id!, req.user!.id);
    if (!ok) throw NotFound("project not found");
    res.status(204).end();
  }),
);
