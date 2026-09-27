import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { getInsights } from './insights.service.js';

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const insightsQuerySchema = z.object({
  days: z.enum(['7', '30', '90']).default('30').transform(Number),
  tz: z.string().max(64).refine(isTimeZone, 'Unknown time zone').default('UTC'),
});

export const insightsRouter = Router();

insightsRouter.get('/', requireAuth, async (req, res) => {
  const { days, tz } = insightsQuerySchema.parse(req.query);
  res.json(await getInsights(currentUser(req).id, days, tz));
});
