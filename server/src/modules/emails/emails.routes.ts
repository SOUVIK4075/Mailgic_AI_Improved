import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { aiLimiter, searchLimiter } from '../../middleware/rateLimit.js';
import * as emails from './emails.controller.js';

export const emailsRouter = Router();

emailsRouter.use(requireAuth);

emailsRouter.post('/compose', aiLimiter, emails.compose);
emailsRouter.post('/compose/stream', aiLimiter, emails.composeStream);
emailsRouter.post('/reply', aiLimiter, emails.reply);
emailsRouter.post('/reply/stream', aiLimiter, emails.replyStream);
emailsRouter.get('/', emails.list);
emailsRouter.get('/search', searchLimiter, emails.search); // before '/:id' so "search" isn't read as an id
emailsRouter.delete('/', emails.clearAll);
emailsRouter.get('/:id', emails.getOne);
emailsRouter.patch('/:id', emails.update);
emailsRouter.delete('/:id', emails.remove);
