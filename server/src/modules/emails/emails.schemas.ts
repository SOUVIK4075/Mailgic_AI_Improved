import { z } from 'zod';
import { EMAIL_TYPE_IDS, LIMITS, TONE_IDS } from '../../config/constants.js';
import { objectId } from '../../lib/validation.js';

const tone = z.enum(TONE_IDS);

const length = z.discriminatedUnion('option', [
  z.object({ option: z.literal('flexible') }),
  z.object({ option: z.literal('custom'), words: z.number().int().min(LIMITS.minWords).max(LIMITS.maxWords) }),
]);

export const composeSchema = z.object({
  type: z.enum(EMAIL_TYPE_IDS),
  tone,
  prompt: z.string().trim().min(LIMITS.promptMinChars, 'Please describe the email in a bit more detail').max(LIMITS.promptMaxChars),
  length: length.default({ option: 'flexible' }),
  useKnowledge: z.boolean().default(false),
});

export const replySchema = z.object({
  incomingEmail: z.string().trim().min(20, 'Paste the full email you want to reply to').max(LIMITS.incomingEmailMaxChars),
  tone,
  instructions: z.string().trim().max(LIMITS.instructionsMaxChars).default(''),
  useKnowledge: z.boolean().default(false),
});

export const listEmailsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: objectId.optional(),
  mode: z.enum(['compose', 'reply']).optional(),
  type: z.enum(EMAIL_TYPE_IDS).optional(),
});

export const searchEmailsSchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Comma-separated list of addresses, e.g. "rahul@acme.dev, priya@acme.dev".
const recipients = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value.split(',').every((addr) => z.email().safeParse(addr.trim()).success),
    'Enter valid email addresses, separated by commas',
  );

// The user's final version, saved when they open it in Gmail. All fields optional, but not all empty.
export const updateEmailSchema = z
  .object({
    subject: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(20_000).optional(),
    recipient: recipients.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');

export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
export type ComposeInput = z.infer<typeof composeSchema>;
export type ReplyInput = z.infer<typeof replySchema>;
export type ListEmailsInput = z.infer<typeof listEmailsSchema>;
