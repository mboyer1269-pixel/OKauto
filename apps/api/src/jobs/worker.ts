import type { Job, PrismaClient } from "@okauto/db";
import type { JobKind } from "@okauto/shared";
import { PgJobQueue } from "./queue.js";
import { incrementCounter } from "../lib/metrics.js";

export type JobHandler = (job: Job) => Promise<void>;

export interface WorkerOptions {
  pollMs: number;
  concurrency: number;
  logger: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };
}

/** Polling worker with bounded concurrency and graceful drain. */
export class JobWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = 0;
  private stopping = false;
  private idleResolvers: (() => void)[] = [];

  constructor(
    private readonly queue: PgJobQueue,
    private readonly handlers: Map<JobKind, JobHandler>,
    private readonly opts: WorkerOptions,
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopping = false;
    const tick = async () => {
      if (this.stopping) return;
      await this.pump();
      if (!this.stopping) {
        this.timer = setTimeout(() => void tick(), this.opts.pollMs + Math.floor(Math.random() * this.opts.pollMs * 0.5));
      }
    };
    this.timer = setTimeout(() => void tick(), 0);
  }

  /** Poll once and run up to `concurrency` jobs. Exposed for tests. */
  async pump(): Promise<number> {
    let claimed = 0;
    while (!this.stopping && this.running < this.opts.concurrency) {
      const job = await this.queue.claim([...this.handlers.keys()]);
      if (!job) break;
      claimed += 1;
      this.running += 1;
      void this.execute(job).finally(() => {
        this.running -= 1;
        if (this.running === 0) {
          for (const resolve of this.idleResolvers.splice(0)) resolve();
        }
      });
    }
    return claimed;
  }

  private async execute(job: Job): Promise<void> {
    const handler = this.handlers.get(job.kind as JobKind);
    if (!handler) {
      await this.queue.fail(job.id, new Error(`No handler registered for kind ${job.kind}`));
      return;
    }
    try {
      await handler(job);
      await this.queue.succeed(job.id);
      incrementCounter("okauto_jobs_succeeded_total", { kind: job.kind });
    } catch (err) {
      const { status } = await this.queue.fail(job.id, err);
      incrementCounter("okauto_jobs_failed_total", { kind: job.kind, final: String(status === "DEAD") });
      this.opts.logger.error({ err, jobId: job.id, kind: job.kind, status }, "job failed");
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.running === 0) return;
    await new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }
}

export function createWorker(
  db: PrismaClient,
  queue: PgJobQueue,
  handlers: Map<JobKind, JobHandler>,
  opts: WorkerOptions,
): JobWorker {
  void db;
  return new JobWorker(queue, handlers, opts);
}
