import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { EmailModel } from '../../models/Email.js';
import { KnowledgeDocumentModel } from '../../models/KnowledgeDocument.js';
import { UsageModel } from '../../models/Usage.js';
import { UserModel } from '../../models/User.js';

export const adminRouter = Router();

// Role-based access control: only users with role "admin" get past requireRole.
adminRouter.use(requireAuth, requireRole('admin'));

adminRouter.get('/stats', async (_req, res) => {
  const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [users, emails, documents, last7Days] = await Promise.all([
    UserModel.estimatedDocumentCount(),
    EmailModel.estimatedDocumentCount(),
    KnowledgeDocumentModel.estimatedDocumentCount(),
    UsageModel.aggregate<{ date: string; requests: number; tokens: number }>([
      { $match: { date: { $gte: since } } },
      {
        $group: {
          _id: '$date',
          requests: { $sum: '$requests' },
          tokens: { $sum: { $add: ['$promptTokens', '$completionTokens'] } },
        },
      },
      { $project: { _id: 0, date: '$_id', requests: 1, tokens: 1 } },
      { $sort: { date: 1 } },
    ]),
  ]);

  res.json({ users, emails, documents, last7Days });
});
