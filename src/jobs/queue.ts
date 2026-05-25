import { Queue, QueueEvents } from "bullmq";
import { bullConnection } from "../redis.js";

export const QUEUE_NAME = "polyrepo";

export type JobName = "send-welcome-email" | "send-task-notification";

export interface SendWelcomeEmailJob {
  name: "send-welcome-email";
  data: { userId: string; email: string; displayName: string };
}

export interface SendTaskNotificationJob {
  name: "send-task-notification";
  data: {
    taskId: string;
    projectId: string;
    actorEmail: string;
    actorName: string;
    title: string;
    kind: "created" | "updated" | "status_changed";
  };
}

export type AppJob = SendWelcomeEmailJob | SendTaskNotificationJob;

export const queue = new Queue(QUEUE_NAME, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: { count: 100, age: 60 * 60 * 24 },
    removeOnFail: { count: 500, age: 60 * 60 * 24 * 7 },
  },
});

export const queueEvents = new QueueEvents(QUEUE_NAME, {
  connection: bullConnection,
});

export async function enqueue<J extends AppJob>(job: J): Promise<void> {
  await queue.add(job.name, job.data);
}
