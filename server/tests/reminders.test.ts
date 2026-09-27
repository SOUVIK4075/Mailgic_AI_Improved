import { beforeEach, describe, expect, it, vi } from 'vitest';

const mailer = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock('../src/lib/mailer.js', () => mailer);

import { signedInAgent } from './helpers.js';
import { EmailModel } from '../src/models/Email.js';
import { ReminderModel } from '../src/models/Reminder.js';
import { processDueReminder } from '../src/modules/reminders/reminders.service.js';

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function seedEmail(userId: string) {
  return EmailModel.create({
    userId,
    mode: 'compose',
    type: 'follow-up',
    tone: 'friendly',
    subject: 'Following up on the interview',
    body: 'Hi Anita, …',
    wordCount: 3,
    recipient: 'anita@acme.dev',
  });
}

beforeEach(() => {
  mailer.sendMail.mockReset().mockResolvedValue(undefined);
});

describe('reminders API', () => {
  it('creates, lists and cancels a reminder', async () => {
    const { agent, user } = await signedInAgent();
    const email = await seedEmail(user.id);

    const created = await agent.post('/api/reminders').send({ emailId: email.id, dueAt: inHours(48), note: 'ask about salary' }).expect(201);
    expect(created.body.reminder).toMatchObject({ emailSubject: 'Following up on the interview', recipient: 'anita@acme.dev', status: 'scheduled' });

    const list = await agent.get('/api/reminders').expect(200);
    expect(list.body.upcoming).toHaveLength(1);

    await agent.delete(`/api/reminders/${created.body.reminder.id}`).expect(204);
    const after = await agent.get('/api/reminders').expect(200);
    expect(after.body.upcoming).toHaveLength(0);
    expect(after.body.past[0].status).toBe('cancelled');

    const again = await agent.delete(`/api/reminders/${created.body.reminder.id}`).expect(409);
    expect(again.body.error.code).toBe('REMINDER_NOT_SCHEDULED');
  });

  it('allows only one upcoming reminder per email', async () => {
    const { agent, user } = await signedInAgent();
    const email = await seedEmail(user.id);
    await agent.post('/api/reminders').send({ emailId: email.id, dueAt: inHours(24) }).expect(201);
    const res = await agent.post('/api/reminders').send({ emailId: email.id, dueAt: inHours(48) }).expect(409);
    expect(res.body.error.code).toBe('REMINDER_EXISTS');
  });

  it('validates the due date and ownership', async () => {
    const alice = await signedInAgent();
    const bob = await signedInAgent();
    const email = await seedEmail(alice.user.id);

    await alice.agent.post('/api/reminders').send({ emailId: email.id, dueAt: inHours(-1) }).expect(400);
    await alice.agent.post('/api/reminders').send({ emailId: email.id, dueAt: inHours(24 * 100) }).expect(400);
    await bob.agent.post('/api/reminders').send({ emailId: email.id, dueAt: inHours(24) }).expect(404);
  });
});

describe('reminders job', () => {
  async function dueReminder() {
    const { user } = await signedInAgent({ email: 'souvik@test.dev', name: 'Souvik' });
    const email = await seedEmail(user.id);
    return ReminderModel.create({
      userId: user.id,
      emailId: email._id,
      emailSubject: email.subject,
      recipient: email.recipient,
      note: 'ask about salary',
      dueAt: new Date(Date.now() - 1000),
    });
  }

  it('emails the user when a reminder is due and marks it sent', async () => {
    const reminder = await dueReminder();

    expect(await processDueReminder()).toBe(true);
    expect(mailer.sendMail).toHaveBeenCalledWith('souvik@test.dev', 'Follow up: Following up on the interview', expect.stringContaining('anita@acme.dev'));
    expect(await ReminderModel.findById(reminder.id)).toMatchObject({ status: 'sent' });
    expect(await processDueReminder()).toBe(false); // nothing left
  });

  it('does not send reminders that are not due yet', async () => {
    const reminder = await dueReminder();
    await ReminderModel.updateOne({ _id: reminder._id }, { dueAt: new Date(Date.now() + 60_000) });
    expect(await processDueReminder()).toBe(false);
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('retries later when sending fails, and gives up after 3 attempts', async () => {
    const reminder = await dueReminder();
    mailer.sendMail.mockRejectedValue(new Error('SMTP down'));

    await processDueReminder();
    const afterFirst = await ReminderModel.findById(reminder.id);
    expect(afterFirst).toMatchObject({ status: 'scheduled', attempts: 1 });
    expect(afterFirst!.dueAt.getTime()).toBeGreaterThan(Date.now()); // pushed into the future

    // Make it due again twice more.
    for (let i = 0; i < 2; i++) {
      await ReminderModel.updateOne({ _id: reminder._id }, { dueAt: new Date(Date.now() - 1000) });
      await processDueReminder();
    }
    expect(await ReminderModel.findById(reminder.id)).toMatchObject({ status: 'failed', attempts: 3 });
  });
});
