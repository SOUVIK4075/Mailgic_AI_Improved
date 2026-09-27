import { logger } from '../lib/logger.js';

export type Job = {
  name: string;
  /** Do one unit of work. Return true if there was something to do (so we check again right away). */
  run: () => Promise<boolean>;
};

const PAUSE_AFTER_ERROR_MS = 60_000;

/**
 * One background loop for all jobs (document ingestion, reminders, search indexing).
 * It runs inside the API process and uses MongoDB as the queue — no Redis/BullMQ needed at this scale.
 *
 * - setTimeout instead of setInterval: a slow tick can never overlap the next one.
 * - If any job did work, the next tick starts immediately (drain the queue); otherwise wait.
 * - A job that throws (e.g. the AI provider is down) is paused for a minute instead of hammering it every 3 s.
 */
export function startWorker(jobs: Job[], intervalMs = 3000) {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const pausedUntil = new Map<string, number>();

  const tick = async () => {
    if (stopped) return;
    let didWork = false;

    for (const job of jobs) {
      if ((pausedUntil.get(job.name) ?? 0) > Date.now()) continue;
      try {
        if (await job.run()) didWork = true;
      } catch (err) {
        logger.error({ err, job: job.name }, 'Background job failed — pausing it for a minute');
        pausedUntil.set(job.name, Date.now() + PAUSE_AFTER_ERROR_MS);
      }
    }

    if (!stopped) timer = setTimeout(tick, didWork ? 0 : intervalMs);
  };

  timer = setTimeout(tick, intervalMs);
  logger.info({ jobs: jobs.map((j) => j.name) }, 'Background worker started');

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
