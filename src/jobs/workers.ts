import { Worker } from "bullmq";
import { logger } from "../logger.js";
import { sendMail } from "../mailer.js";
import { bullConnection } from "../redis.js";
import { QUEUE_NAME, type AppJob } from "./queue.js";

export function startWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const name = job.name as AppJob["name"];
      logger.info({ jobId: job.id, name }, "processing job");
      switch (name) {
        case "send-welcome-email": {
          const data = job.data as {
            userId: string;
            email: string;
            displayName: string;
          };
          await sendMail({
            to: data.email,
            subject: "Welcome to Polyrepo Demo",
            text: `Hi ${data.displayName},\n\nThanks for signing up to the polyrepo demo. You're all set.\n\n— Polyrepo`,
            html: `<p>Hi <b>${data.displayName}</b>,</p><p>Thanks for signing up to the polyrepo demo. You're all set.</p><p>— Polyrepo</p>`,
          });
          break;
        }
        case "send-task-notification": {
          const data = job.data as {
            taskId: string;
            projectId: string;
            actorEmail: string;
            actorName: string;
            title: string;
            kind: "created" | "updated" | "status_changed";
          };
          await sendMail({
            to: data.actorEmail,
            subject: `Task ${data.kind.replace("_", " ")}: ${data.title}`,
            text: `Hi ${data.actorName},\n\nYour task "${data.title}" was ${data.kind.replace("_", " ")} (id=${data.taskId}, project=${data.projectId}).`,
          });
          break;
        }
        default: {
          // exhaustiveness check
          const _never: never = name;
          void _never;
        }
      }
    },
    {
      connection: bullConnection,
      concurrency: 4,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, name: job.name }, "job completed");
  });
  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, name: job?.name, err: err.message },
      "job failed",
    );
  });

  return worker;
}
