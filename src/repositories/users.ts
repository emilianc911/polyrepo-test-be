import { query } from "../db.js";

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  created_at: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    createdAt: u.created_at,
  };
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    "SELECT id, email, display_name, password_hash, created_at FROM users WHERE email = $1",
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    "SELECT id, email, display_name, password_hash, created_at FROM users WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function createUser(args: {
  email: string;
  displayName: string;
  passwordHash: string;
}): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, password_hash, created_at`,
    [args.email.toLowerCase(), args.displayName, args.passwordHash],
  );
  return rows[0]!;
}
