import { env } from '../../config/env.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendMail } from '../../lib/mailer.js';
import { ReminderModel } from '../../models/Reminder.js';
import { UserModel } from '../../models/User.js';
import { getById as getEmail } from '../emails/emails.service.js';
import type { CreateReminderInput } from './reminders.schemas.js';

const MAX_SCHEDULED_PER_USER = 50;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;
const STALE_LOCK_MS = 5 * 60 * 1000;

export async function create(userId: string, input: CreateReminderInput) {
  const email = await getEmail(userId, input.emailId); // 404 if it isn't this user's email

  const scheduled = await ReminderModel.countDocuments({ userId, status: 'scheduled' });
  if (scheduled >= MAX_SCHEDULED_PER_USER) {
    throw conflict('TOO_MANY_REMINDERS', `You can have at most ${MAX_SCHEDULED_PER_USER} upcoming reminders`);
  }

  try {
    return await ReminderModel.create({
      userId,
      emailId: email._id,
      emailSubject: email.subject,
      recipient: email.recipient ?? null,
      note: input.note,
      dueAt: input.dueAt,
    });
  } catch (err) {
    // The partial unique index allows only one *scheduled* reminder per email.
    if ((err as { code?: number }).code === 11000) {
      throw conflict('REMINDER_EXISTS', 'This email already has an upcoming reminder');
    }
    throw err;
  }
}

export async function list(userId: string) {
  const [upcoming, past] = await Promise.all([
    ReminderModel.find({ userId, status: { $in: ['scheduled', 'sending'] } }).sort({ dueAt: 1 }),
    ReminderModel.find({ userId, status: { $in: ['sent', 'cancelled', 'failed'] } }).sort({ updatedAt: -1 }).limit(20),
  ]);
  return { upcoming, past };
}

export async function cancel(userId: string, id: string) {
  const cancelled = await ReminderModel.findOneAndUpdate({ _id: id, userId, status: 'scheduled' }, { status: 'cancelled' });
  if (cancelled) return;
  // Tell "not yours / doesn't exist" (404) apart from "already sent or cancelled" (409).
  if (await ReminderModel.exists({ _id: id, userId })) {
    throw new AppError(409, 'REMINDER_NOT_SCHEDULED', 'This reminder was already sent or cancelled');
  }
  throw notFound('Reminder');
}

/**
 * Background job: send ONE due reminder. Returns true if it did something.
 *
 * - Claim atomically (scheduled → sending), so two workers never send the same reminder.
 * - On failure: retry later (5 min, then 10 min), give up after 3 attempts.
 * - This is "at-least-once" delivery: if the server crashed right after the email went out but
 *   before we marked it sent, the stale-lock check would send it again. For a reminder that's an
 *   acceptable trade-off (a duplicate reminder is better than a lost one).
 */
export async function processDueReminder(): Promise<boolean> {
  const now = new Date();
  await ReminderModel.updateMany(
    { status: 'sending', lockedAt: { $lt: new Date(now.getTime() - STALE_LOCK_MS) } },
    { status: 'scheduled', lockedAt: null },
  );

  const reminder = await ReminderModel.findOneAndUpdate(
    { status: 'scheduled', dueAt: { $lte: now } },
    { status: 'sending', lockedAt: now, $inc: { attempts: 1 } },
    { sort: { dueAt: 1 }, new: true },
  );
  if (!reminder) return false;

  const log = logger.child({ reminderId: reminder.id });
  try {
    const user = await UserModel.findById(reminder.userId);
    if (!user) {
      await ReminderModel.updateOne({ _id: reminder._id }, { status: 'failed', lockedAt: null });
      return true;
    }

    const to = reminder.recipient ? ` to ${reminder.recipient}` : '';
    const note = reminder.note ? `Your note: ${reminder.note}\n\n` : '';
    await sendMail(
      user.email,
      `Follow up: ${reminder.emailSubject}`,
      `Hi ${user.name},\n\nYou asked me to remind you about the email you sent${to}:\n\n  "${reminder.emailSubject}"\n\n${note}` +
        `If you haven't heard back yet, now is a good time to follow up.\n${env.APP_URL}/app/history\n\n— Mailgic`,
    );

    await ReminderModel.updateOne({ _id: reminder._id }, { status: 'sent', sentAt: new Date(), lockedAt: null });
    log.info('Reminder sent');
  } catch (err) {
    const giveUp = reminder.attempts >= MAX_ATTEMPTS;
    log.error({ err, attempt: reminder.attempts }, giveUp ? 'Reminder failed permanently' : 'Reminder failed, will retry');
    await ReminderModel.updateOne(
      { _id: reminder._id },
      giveUp
        ? { status: 'failed', lockedAt: null }
        : { status: 'scheduled', lockedAt: null, dueAt: new Date(Date.now() + RETRY_DELAY_MS * reminder.attempts) },
    );
  }
  return true;
}
