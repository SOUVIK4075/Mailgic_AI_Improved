import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { LIMITS } from '../../config/constants.js';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import * as knowledge from './knowledge.controller.js';
import { ALLOWED_EXTENSIONS } from './textExtractor.js';

// Files are kept in memory (max 5 MB) — we only need the extracted text, never the file itself.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase());
    if (ok) cb(null, true);
    else cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only .pdf, .txt and .md files are supported'));
  },
});

export const knowledgeRouter = Router();

knowledgeRouter.use(requireAuth);

knowledgeRouter.post('/', upload.single('file'), knowledge.create);
knowledgeRouter.get('/', knowledge.list);
knowledgeRouter.delete('/:id', knowledge.remove);
