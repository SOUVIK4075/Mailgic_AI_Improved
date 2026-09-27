import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const REMINDER_STATUSES = ['scheduled', 'sending', 'sent', 'cancelled', 'failed'] as const;

// "Remind me to follow up on this email on <dueAt>". The reminders job picks up due ones.
const reminderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emailId: { type: Schema.Types.ObjectId, ref: 'Email', required: true },
    // Copied from the email so the reminder still makes sense if the email is deleted later.
    emailSubject: { type: String, required: true },
    recipient: { type: String, default: null },
    note: { type: String, default: '' },
    dueAt: { type: Date, required: true },
    status: { type: String, enum: REMINDER_STATUSES, default: 'scheduled' },
    attempts: { type: Number, default: 0 },
    lockedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

reminderSchema.index({ status: 1, dueAt: 1 }); // job: "scheduled and due, oldest first"
reminderSchema.index({ userId: 1, dueAt: 1 }); // the user's list
// At most one *scheduled* reminder per email (partial unique index — other statuses don't count).
reminderSchema.index({ emailId: 1 }, { unique: true, partialFilterExpression: { status: 'scheduled' } });

export type Reminder = InferSchemaType<typeof reminderSchema>;
export type ReminderDoc = HydratedDocument<Reminder>;
export const ReminderModel = model('Reminder', reminderSchema);

export function toReminderDTO(r: ReminderDoc) {
  return {
    id: r.id as string,
    emailId: String(r.emailId),
    emailSubject: r.emailSubject,
    recipient: r.recipient ?? null,
    note: r.note ?? '',
    dueAt: r.dueAt,
    // "sending" is an internal state; to the user it's still upcoming.
    status: r.status === 'sending' ? 'scheduled' : r.status,
    sentAt: r.sentAt ?? null,
    createdAt: r.createdAt,
  };
}
