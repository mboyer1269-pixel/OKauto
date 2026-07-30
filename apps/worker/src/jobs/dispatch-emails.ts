import { prisma } from "@lotpilot/db";
import nodemailer, { type Transporter } from "nodemailer";
import { log } from "../log.js";

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const smtpUrl = process.env.SMTP_URL;
  transporter = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
  return transporter;
}

/**
 * Email fan-out for notifications. Without SMTP_URL configured, emails are
 * logged (dev mode) and the notification is still marked dispatched so it
 * never re-queues.
 */
export async function dispatchEmails(): Promise<{ dispatched: number }> {
  const pending = await prisma.notification.findMany({
    where: { emailedAt: null },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: { user: { select: { email: true, name: true } } },
  });
  if (pending.length === 0) return { dispatched: 0 };

  const transport = getTransporter();
  const from = process.env.EMAIL_FROM ?? "LotPilot <no-reply@lotpilot.local>";

  let dispatched = 0;
  for (const notification of pending) {
    try {
      if (transport) {
        await transport.sendMail({
          from,
          to: notification.user.email,
          subject: notification.title,
          text: `${notification.body}\n\n— LotPilot`,
        });
      } else {
        log("info", "email (dev mode, SMTP not configured)", {
          to: notification.user.email,
          subject: notification.title,
        });
      }
      await prisma.notification.update({
        where: { id: notification.id },
        data: { emailedAt: new Date() },
      });
      dispatched++;
    } catch (err) {
      log("error", "email dispatch failed", {
        notificationId: notification.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { dispatched };
}
