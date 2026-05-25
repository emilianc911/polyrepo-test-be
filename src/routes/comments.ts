import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../auth/middleware.js";
import { findProject } from "../repositories/projects.js";
import { createComment, listComments } from "../repositories/comments.js";
import { findTask } from "../repositories/tasks.js";
import { CreateCommentSchema } from "../schemas/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { BadRequest, Forbidden, NotFound } from "../utils/errors.js";
import { publishEvent } from "../ws/server.js";

export const commentsRouter = Router();

commentsRouter.use(requireAuth);

async function assertTaskAccess(taskId: string, userId: string) {
  const task = await findTask(taskId);
  if (!task) throw NotFound("task not found");
  const project = await findProject(task.project_id, userId);
  if (!project) throw Forbidden();
  return task;
}

commentsRouter.get(
  "/tasks/:taskId/comments",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await assertTaskAccess(req.params.taskId!, req.user!.id);
    const comments = await listComments(req.params.taskId!);
    res.json({ comments });
  }),
);

commentsRouter.post(
  "/tasks/:taskId/comments",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const task = await assertTaskAccess(req.params.taskId!, req.user!.id);
    const parsed = CreateCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw BadRequest("invalid comment payload", parsed.error.flatten());
    }
    const comment = await createComment({
      taskId: req.params.taskId!,
      userId: req.user!.id,
      body: parsed.data.body,
    });
    await publishEvent({
      type: "comment.created",
      projectId: task.project_id,
      payload: { comment },
    });
    res.status(201).json({ comment });
  }),
);
