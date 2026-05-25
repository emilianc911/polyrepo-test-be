import { query } from "../db.js";

export interface AttachmentRow {
  id: string;
  task_id: string;
  user_id: string;
  storage_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface AttachmentDto {
  id: string;
  taskId: string;
  userId: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  downloadUrl?: string;
}

export function toDto(row: AttachmentRow, downloadUrl?: string): AttachmentDto {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size_bytes,
    createdAt: row.created_at,
    downloadUrl,
  };
}

export async function listAttachments(taskId: string): Promise<AttachmentRow[]> {
  const { rows } = await query<AttachmentRow>(
    `SELECT id, task_id, user_id, storage_key, filename, content_type, size_bytes, created_at
       FROM attachments
      WHERE task_id = $1
      ORDER BY created_at DESC`,
    [taskId],
  );
  return rows;
}

export async function createAttachment(args: {
  taskId: string;
  userId: string;
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<AttachmentRow> {
  const { rows } = await query<AttachmentRow>(
    `INSERT INTO attachments (task_id, user_id, storage_key, filename, content_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, task_id, user_id, storage_key, filename, content_type, size_bytes, created_at`,
    [
      args.taskId,
      args.userId,
      args.storageKey,
      args.filename,
      args.contentType,
      args.sizeBytes,
    ],
  );
  return rows[0]!;
}

export async function findAttachment(id: string): Promise<AttachmentRow | null> {
  const { rows } = await query<AttachmentRow>(
    `SELECT id, task_id, user_id, storage_key, filename, content_type, size_bytes, created_at
       FROM attachments WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function deleteAttachment(id: string): Promise<boolean> {
  const res = await query("DELETE FROM attachments WHERE id = $1", [id]);
  return (res.rowCount ?? 0) > 0;
}
