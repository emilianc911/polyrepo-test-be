import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../auth/middleware.js";
import { enqueue } from "../jobs/queue.js";
import { findProject } from "../repositories/projects.js";
import {
  createTask,
  deleteTask,
  findTask,
  listTasks,
  updateTask,
} from "../repositories/tasks.js";
import { findUserById } from "../repositories/users.js";
import {
  CreateTaskSchema,
  UpdateTaskSchema,
} from "../schemas/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { BadRequest, Forbidden, NotFound } from "../utils/errors.js";
import { publishEvent } from "../ws/server.js";

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

async function assertProjectOwnership(projectId: string, userId: string): Promise<void> {
  const project = await findProject(projectId, userId);
  if (!project) throw NotFound("project not found or not yours");
}

async function assertTaskAccess(taskId: string, userId: string) {
  const task = await findTask(taskId);
  if (!task) throw NotFound("task not found");
  const project = await findProject(task.project_id, userId);
  if (!project) throw Forbidden();
  return task;
}

tasksRouter.get(
  "/projects/:projectId/tasks",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await assertProjectOwnership(req.params.projectId!, req.user!.id);
    const tasks = await listTasks(req.params.projectId!);
    res.json({ tasks });
  }),
);

tasksRouter.post(
  "/projects/:projectId/tasks",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await assertProjectOwnership(req.params.projectId!, req.user!.id);
    const parsed = CreateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw BadRequest("invalid task payload", parsed.error.flatten());
    }
    const task = await createTask({
      projectId: req.params.projectId!,
      createdBy: req.user!.id,
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate ?? null,
    });

    const author = await findUserById(req.user!.id);
    if (author) {
      await enqueue({
        name: "send-task-notification",
        data: {
          taskId: task.id,
          projectId: task.projectId,
          actorEmail: author.email,
          actorName: author.display_name,
          title: task.title,
          kind: "created",
        },
      });
    }

    await publishEvent({
      type: "task.created",
      projectId: task.projectId,
      payload: { task },
    });
    res.status(201).json({ task });
  }),
);

tasksRouter.patch(
  "/tasks/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const existing = await assertTaskAccess(req.params.id!, req.user!.id);
    const parsed = UpdateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw BadRequest("invalid task payload", parsed.error.flatten());
    }
    const updated = await updateTask({
      taskId: req.params.id!,
      patch: parsed.data,
    });
    if (!updated) throw NotFound("task not found");

    if (parsed.data.status && parsed.data.status !== existing.status) {
      const author = await findUserById(req.user!.id);
      if (author) {
        await enqueue({
          name: "send-task-notification",
          data: {
            taskId: updated.id,
            projectId: updated.projectId,
            actorEmail: author.email,
            actorName: author.display_name,
            title: updated.title,
            kind: "status_changed",
          },
        });
      }
    }

    await publishEvent({
      type: "task.updated",
      projectId: updated.projectId,
      payload: { task: updated },
    });
    res.json({ task: updated });
  }),
);

tasksRouter.delete(
  "/tasks/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const existing = await assertTaskAccess(req.params.id!, req.user!.id);
    const ok = await deleteTask(req.params.id!);
    if (!ok) throw NotFound("task not found");
    await publishEvent({
      type: "task.deleted",
      projectId: existing.project_id,
      payload: { taskId: existing.id },
    });
    res.status(204).end();
  }),
);
