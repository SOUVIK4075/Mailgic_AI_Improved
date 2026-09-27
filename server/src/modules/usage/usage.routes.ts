import { Router } from 'express';
import { requireAuth, currentUser } from '../../middleware/auth.js';
import { getTodayUsage } from './usage.service.js';

export const usageRouter = Router();

usageRouter.get('/', requireAuth, async (req, res) => {
  res.json(await getTodayUsage(currentUser(req).id));
});
