import { query } from "../db.js";

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectDto {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
}

export function toDto(row: ProjectRow & { task_count?: string }): ProjectDto {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taskCount: row.task_count !== undefined ? Number(row.task_count) : undefined,
  };
}

export async function listProjectsForUser(userId: string): Promise<ProjectDto[]> {
  const { rows } = await query<ProjectRow & { task_count: string }>(
    `SELECT p.id, p.owner_id, p.name, p.description, p.created_at, p.updated_at,
            COALESCE(t.cnt, 0)::text AS task_count
       FROM projects p
       LEFT JOIN (
         SELECT project_id, COUNT(*) AS cnt FROM tasks GROUP BY project_id
       ) t ON t.project_id = p.id
      WHERE p.owner_id = $1
      ORDER BY p.created_at DESC`,
    [userId],
  );
  return rows.map(toDto);
}

export async function findProject(
  id: string,
  ownerId: string,
): Promise<ProjectDto | null> {
  const { rows } = await query<ProjectRow>(
    "SELECT id, owner_id, name, description, created_at, updated_at FROM projects WHERE id = $1 AND owner_id = $2",
    [id, ownerId],
  );
  return rows[0] ? toDto(rows[0]) : null;
}

export async function createProject(args: {
  ownerId: string;
  name: string;
  description: string;
}): Promise<ProjectDto> {
  const { rows } = await query<ProjectRow>(
    `INSERT INTO projects (owner_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id, owner_id, name, description, created_at, updated_at`,
    [args.ownerId, args.name, args.description],
  );
  return toDto(rows[0]!);
}

export async function updateProject(args: {
  id: string;
  ownerId: string;
  patch: { name?: string; description?: string };
}): Promise<ProjectDto | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (args.patch.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(args.patch.name);
  }
  if (args.patch.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(args.patch.description);
  }
  if (sets.length === 0) {
    return findProject(args.id, args.ownerId);
  }
  sets.push(`updated_at = NOW()`);
  values.push(args.id, args.ownerId);
  const { rows } = await query<ProjectRow>(
    `UPDATE projects SET ${sets.join(", ")} WHERE id = $${idx++} AND owner_id = $${idx++}
     RETURNING id, owner_id, name, description, created_at, updated_at`,
    values,
  );
  return rows[0] ? toDto(rows[0]) : null;
}

export async function deleteProject(id: string, ownerId: string): Promise<boolean> {
  const res = await query(
    "DELETE FROM projects WHERE id = $1 AND owner_id = $2",
    [id, ownerId],
  );
  return (res.rowCount ?? 0) > 0;
}
