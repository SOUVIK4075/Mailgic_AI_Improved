import { Types } from 'mongoose';
import { EMAIL_TYPES, TONES } from '../../config/constants.js';
import { EmailModel } from '../../models/Email.js';
import { ReminderModel } from '../../models/Reminder.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const labelOf = (list: readonly { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;
const is1 = (condition: unknown) => ({ $cond: [condition, 1, 0] });

type Totals = {
  emails: number;
  composed: number;
  replies: number;
  sentViaGmail: number;
  avgWords: number | null;
  withPlaceholders: number;
  usedKnowledge: number;
  promptTokens: number;
  completionTokens: number;
  avgLatencyMs: number | null;
};
type Bucket = { _id: string; count: number };
type FacetResult = { totals: Totals[]; perDay: Bucket[]; byType: Bucket[]; byTone: Bucket[]; topRecipients: Bucket[] };

/** "YYYY-MM-DD" for a moment in a given time zone (en-CA happens to format dates that way). */
const dayIn = (date: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);

/**
 * One aggregation query answers every question on the Insights page.
 * `$facet` runs several sub-pipelines over the same matched emails in a single pass,
 * instead of 5 separate queries that would each scan the same documents again.
 */
export async function getInsights(userId: string, days: number, timeZone: string) {
  const to = new Date();
  const from = new Date(to.getTime() - days * DAY_MS);

  const [facets, scheduled, sent] = await Promise.all([
    EmailModel.aggregate<FacetResult>([
      // Uses the { userId, createdAt } index, so only this user's recent emails are read.
      { $match: { userId: new Types.ObjectId(userId), createdAt: { $gte: from } } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                emails: { $sum: 1 },
                composed: { $sum: is1({ $eq: ['$mode', 'compose'] }) },
                replies: { $sum: is1({ $eq: ['$mode', 'reply'] }) },
                sentViaGmail: { $sum: is1({ $gt: [{ $strLenCP: { $ifNull: ['$recipient', ''] } }, 0] }) },
                avgWords: { $avg: '$wordCount' },
                withPlaceholders: { $sum: is1({ $gt: [{ $size: { $ifNull: ['$placeholders', []] } }, 0] }) },
                usedKnowledge: { $sum: is1({ $gt: [{ $size: { $ifNull: ['$sources', []] } }, 0] }) },
                promptTokens: { $sum: '$ai.promptTokens' },
                completionTokens: { $sum: '$ai.completionTokens' },
                avgLatencyMs: { $avg: '$ai.latencyMs' },
              },
            },
          ],
          // Group by calendar day *in the user's time zone*, not UTC.
          perDay: [{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: timeZone } }, count: { $sum: 1 } } }],
          byType: [{ $match: { mode: 'compose' } }, { $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          byTone: [{ $group: { _id: '$tone', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          // "a@x.com, b@y.com" → one row per address → count per address.
          topRecipients: [
            { $match: { recipient: { $nin: [null, ''] } } },
            { $project: { address: { $split: ['$recipient', ','] } } },
            { $unwind: '$address' },
            { $project: { address: { $toLower: { $trim: { input: '$address' } } } } },
            { $group: { _id: '$address', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 5 },
          ],
        },
      },
    ]),
    ReminderModel.countDocuments({ userId, status: { $in: ['scheduled', 'sending'] } }),
    ReminderModel.countDocuments({ userId, status: 'sent' }),
  ]);

  const f = facets[0]!;
  const t = f.totals[0];

  // Days with no emails don't appear in the aggregation — fill them in with 0 so the chart has no gaps.
  const counts = new Map(f.perDay.map((d) => [d._id, d.count]));
  const perDay = Array.from({ length: days }, (_, i) => {
    const date = dayIn(new Date(to.getTime() - (days - 1 - i) * DAY_MS), timeZone);
    return { date, count: counts.get(date) ?? 0 };
  });

  return {
    range: { days, from, to },
    totals: {
      emails: t?.emails ?? 0,
      composed: t?.composed ?? 0,
      replies: t?.replies ?? 0,
      sentViaGmail: t?.sentViaGmail ?? 0,
      avgWords: Math.round(t?.avgWords ?? 0),
      withPlaceholders: t?.withPlaceholders ?? 0,
      usedKnowledge: t?.usedKnowledge ?? 0,
    },
    perDay,
    byType: f.byType.map((b) => ({ type: b._id, label: labelOf(EMAIL_TYPES, b._id), count: b.count })),
    byTone: f.byTone.map((b) => ({ tone: b._id, label: labelOf(TONES, b._id), count: b.count })),
    topRecipients: f.topRecipients.map((b) => ({ address: b._id, count: b.count })),
    ai: {
      promptTokens: t?.promptTokens ?? 0,
      completionTokens: t?.completionTokens ?? 0,
      avgLatencyMs: Math.round(t?.avgLatencyMs ?? 0),
    },
    reminders: { scheduled, sent },
  };
}
