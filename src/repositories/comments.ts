import { query } from "../db.js";

export interface CommentRow {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
  display_name: string;
}

export interface CommentDto {
  id: string;
  taskId: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export function toDto(row: CommentRow): CommentDto {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    authorName: row.display_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function listComments(taskId: string): Promise<CommentDto[]> {
  const { rows } = await query<CommentRow>(
    `SELECT c.id, c.task_id, c.user_id, c.body, c.created_at, u.display_name
       FROM comments c
       JOIN users u ON u.id = c.user_id
      WHERE c.task_id = $1
      ORDER BY c.created_at ASC`,
    [taskId],
  );
  return rows.map(toDto);
}

export async function createComment(args: {
  taskId: string;
  userId: string;
  body: string;
}): Promise<CommentDto> {
  const { rows } = await query<CommentRow>(
    `WITH inserted AS (
       INSERT INTO comments (task_id, user_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, task_id, user_id, body, created_at
     )
     SELECT i.*, u.display_name FROM inserted i JOIN users u ON u.id = i.user_id`,
    [args.taskId, args.userId, args.body],
  );
  return toDto(rows[0]!);
}
