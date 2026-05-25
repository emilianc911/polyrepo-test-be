import { Router } from "express";
import { nanoid } from "nanoid";
import { requireAuth, type AuthenticatedRequest } from "../auth/middleware.js";
import {
  createAttachment,
  deleteAttachment,
  findAttachment,
  listAttachments,
  toDto,
} from "../repositories/attachments.js";
import { findProject } from "../repositories/projects.js";
import { findTask } from "../repositories/tasks.js";
import {
  ConfirmAttachmentSchema,
  PresignUploadSchema,
} from "../schemas/index.js";
import { deleteObject, presignDownload, presignUpload } from "../storage.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { BadRequest, Forbidden, NotFound } from "../utils/errors.js";
import { publishEvent } from "../ws/server.js";

export const attachmentsRouter = Router();

attachmentsRouter.use(requireAuth);

async function assertTaskAccess(taskId: string, userId: string) {
  const task = await findTask(taskId);
  if (!task) throw NotFound("task not found");
  const project = await findProject(task.project_id, userId);
  if (!project) throw Forbidden();
  return task;
}

attachmentsRouter.get(
  "/tasks/:taskId/attachments",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await assertTaskAccess(req.params.taskId!, req.user!.id);
    const rows = await listAttachments(req.params.taskId!);
    const enriched = await Promise.all(
      rows.map(async (r) => toDto(r, await presignDownload(r.storage_key))),
    );
    res.json({ attachments: enriched });
  }),
);

attachmentsRouter.post(
  "/tasks/:taskId/attachments/presign",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await assertTaskAccess(req.params.taskId!, req.user!.id);
    const parsed = PresignUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      throw BadRequest("invalid presign payload", parsed.error.flatten());
    }
    const safeName = parsed.data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const key = `tasks/${req.params.taskId}/${nanoid(12)}-${safeName}`;
    const uploadUrl = await presignUpload(key, parsed.data.contentType, 600);
    res.json({ uploadUrl, key });
  }),
);

attachmentsRouter.post(
  "/tasks/:taskId/attachments/confirm",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const task = await assertTaskAccess(req.params.taskId!, req.user!.id);
    const parsed = ConfirmAttachmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw BadRequest("invalid confirm payload", parsed.error.flatten());
    }
    if (!parsed.data.key.startsWith(`tasks/${task.id}/`)) {
      throw BadRequest("storage key does not belong to this task");
    }
    const row = await createAttachment({
      taskId: task.id,
      userId: req.user!.id,
      storageKey: parsed.data.key,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.size,
    });
    const downloadUrl = await presignDownload(row.storage_key);
    const dto = toDto(row, downloadUrl);
    await publishEvent({
      type: "attachment.created",
      projectId: task.project_id,
      payload: { attachment: dto },
    });
    res.status(201).json({ attachment: dto });
  }),
);

attachmentsRouter.delete(
  "/attachments/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const att = await findAttachment(req.params.id!);
    if (!att) throw NotFound("attachment not found");
    const task = await findTask(att.task_id);
    if (!task) throw NotFound("task not found");
    const project = await findProject(task.project_id, req.user!.id);
    if (!project) throw Forbidden();

    await deleteObject(att.storage_key).catch(() => undefined);
    await deleteAttachment(att.id);
    await publishEvent({
      type: "attachment.deleted",
      projectId: task.project_id,
      payload: { attachmentId: att.id, taskId: att.task_id },
    });
    res.status(204).end();
  }),
);
