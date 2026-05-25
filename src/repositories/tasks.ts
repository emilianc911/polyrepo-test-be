import { query } from "../db.js";
import type { TaskPriorityType, TaskStatusType } from "../schemas/index.js";

export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatusType;
  priority: TaskPriorityType;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskDto {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatusType;
  priority: TaskPriorityType;
  dueDate: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function toDto(row: TaskRow): TaskDto {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTasks(projectId: string): Promise<TaskDto[]> {
  const { rows } = await query<TaskRow>(
    `SELECT id, project_id, title, description, status, priority, due_date,
            created_by, created_at, updated_at
       FROM tasks
      WHERE project_id = $1
      ORDER BY
        CASE status WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC`,
    [projectId],
  );
  return rows.map(toDto);
}

export async function findTask(taskId: string): Promise<TaskRow | null> {
  const { rows } = await query<TaskRow>(
    `SELECT id, project_id, title, description, status, priority, due_date,
            created_by, created_at, updated_at
       FROM tasks WHERE id = $1`,
    [taskId],
  );
  return rows[0] ?? null;
}

export async function createTask(args: {
  projectId: string;
  createdBy: string;
  title: string;
  description: string;
  status: TaskStatusType;
  priority: TaskPriorityType;
  dueDate: string | null;
}): Promise<TaskDto> {
  const { rows } = await query<TaskRow>(
    `INSERT INTO tasks (project_id, title, description, status, priority, due_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, project_id, title, description, status, priority, due_date,
               created_by, created_at, updated_at`,
    [
      args.projectId,
      args.title,
      args.description,
      args.status,
      args.priority,
      args.dueDate,
      args.createdBy,
    ],
  );
  return toDto(rows[0]!);
}

export async function updateTask(args: {
  taskId: string;
  patch: {
    title?: string;
    description?: string;
    status?: TaskStatusType;
    priority?: TaskPriorityType;
    dueDate?: string | null;
  };
}): Promise<TaskDto | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, column] of [
    ["title", "title"],
    ["description", "description"],
    ["status", "status"],
    ["priority", "priority"],
    ["dueDate", "due_date"],
  ] as const) {
    const v = (args.patch as Record<string, unknown>)[key];
    if (v !== undefined) {
      sets.push(`${column} = $${idx++}`);
      values.push(v);
    }
  }
  if (sets.length === 0) {
    const r = await findTask(args.taskId);
    return r ? toDto(r) : null;
  }
  sets.push(`updated_at = NOW()`);
  values.push(args.taskId);
  const { rows } = await query<TaskRow>(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${idx}
     RETURNING id, project_id, title, description, status, priority, due_date,
               created_by, created_at, updated_at`,
    values,
  );
  return rows[0] ? toDto(rows[0]) : null;
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const res = await query("DELETE FROM tasks WHERE id = $1", [taskId]);
  return (res.rowCount ?? 0) > 0;
}
