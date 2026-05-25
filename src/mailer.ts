import nodemailer from "nodemailer";
import { config } from "./config.js";
import { logger } from "./logger.js";

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false,
  auth: config.smtp.user
    ? { user: config.smtp.user, pass: config.smtp.pass ?? "" }
    : undefined,
});

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  try {
    const info = await transporter.sendMail({
      from: config.smtp.from,
      ...msg,
    });
    logger.info({ messageId: info.messageId, to: msg.to }, "mail sent");
  } catch (err) {
    logger.error({ err: (err as Error).message, to: msg.to }, "mail send failed");
    throw err;
  }
}
