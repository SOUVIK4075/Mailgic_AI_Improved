import { z } from 'zod';
import { objectId } from '../../lib/validation.js';

const MIN_AHEAD_MS = 5 * 60 * 1000 - 60 * 1000; // "at least 5 minutes", with a minute of slack for slow clients
const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

export const createReminderSchema = z.object({
  emailId: objectId,
  dueAt: z.coerce.date().refine((d) => {
    const ahead = d.getTime() - Date.now();
    return ahead >= MIN_AHEAD_MS && ahead <= MAX_AHEAD_MS;
  }, 'Pick a time between 5 minutes and 90 days from now'),
  note: z.string().trim().max(200).default(''),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
