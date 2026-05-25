import { z } from "zod";

export const TaskStatus = z.enum(["todo", "in_progress", "done"]);
export const TaskPriority = z.enum(["low", "medium", "high"]);

export const RegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80),
});

export const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().default(""),
});

export const UpdateProjectSchema = CreateProjectSchema.partial();

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().default(""),
  status: TaskStatus.optional().default("todo"),
  priority: TaskPriority.optional().default("medium"),
  dueDate: z.string().datetime().optional().nullable(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  dueDate: z.string().datetime().optional().nullable(),
});

export const CreateCommentSchema = z.object({
  body: z.string().min(1).max(4000),
});

export const PresignUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  size: z.number().int().nonnegative().max(50 * 1024 * 1024), // 50 MB
});

export const ConfirmAttachmentSchema = z.object({
  key: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  size: z.number().int().nonnegative(),
});

export type TaskStatusType = z.infer<typeof TaskStatus>;
export type TaskPriorityType = z.infer<typeof TaskPriority>;
