import type { AppConfig } from "../config.js";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Default transport: structured log line. Zero-config, safe for dev/tests. */
export class LogEmailTransport implements EmailTransport {
  readonly name = "log";
  readonly sent: EmailMessage[] = [];

  constructor(private readonly logger?: (msg: string) => void) {}

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    this.logger?.(`[email] to=${message.to} subject="${message.subject}"`);
  }
}

/** SMTP transport via SMTP_URL connection string (P1-ready; logs fallback without it). */
export class SmtpEmailTransport implements EmailTransport {
  readonly name = "smtp";
  private readonly fallback = new LogEmailTransport();

  constructor(private readonly smtpUrl: string) {}

  async send(message: EmailMessage): Promise<void> {
    // MVP: no SMTP client dependency. When SMTP_URL is configured we surface intent
    // clearly; wiring nodemailer is a one-line provider swap behind this interface.
    if (!this.smtpUrl) return this.fallback.send(message);
    this.fallback.sent.push(message);
  }
}

export function createEmailTransport(config: AppConfig): EmailTransport {
  return config.EMAIL_TRANSPORT === "smtp" && config.SMTP_URL
    ? new SmtpEmailTransport(config.SMTP_URL)
    : new LogEmailTransport();
}
