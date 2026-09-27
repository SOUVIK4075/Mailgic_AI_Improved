import { Router } from 'express';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { idParamSchema } from '../../lib/validation.js';
import { toReminderDTO } from '../../models/Reminder.js';
import { createReminderSchema } from './reminders.schemas.js';
import * as reminders from './reminders.service.js';

export const remindersRouter = Router();

remindersRouter.use(requireAuth);

remindersRouter.post('/', async (req, res) => {
  const input = createReminderSchema.parse(req.body);
  const reminder = await reminders.create(currentUser(req).id, input);
  res.status(201).json({ reminder: toReminderDTO(reminder) });
});

remindersRouter.get('/', async (req, res) => {
  const { upcoming, past } = await reminders.list(currentUser(req).id);
  res.json({ upcoming: upcoming.map(toReminderDTO), past: past.map(toReminderDTO) });
});

remindersRouter.delete('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await reminders.cancel(currentUser(req).id, id);
  res.status(204).end();
});
