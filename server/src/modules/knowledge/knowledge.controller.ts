import path from 'node:path';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { LIMITS } from '../../config/constants.js';
import { currentUser } from '../../middleware/auth.js';
import { idParamSchema } from '../../lib/validation.js';
import { toDocumentDTO } from '../../models/KnowledgeDocument.js';
import * as knowledgeService from './knowledge.service.js';
import { extractFileText } from './textExtractor.js';

const title = z.string().trim().min(1).max(120);
const uploadFieldsSchema = z.object({ title: title.optional() });
const pasteSchema = z.object({ title, text: z.string().min(1).max(LIMITS.knowledgeTextMaxChars) });

// Accepts either a multipart file upload or JSON { title, text } for pasted content.
export async function create(req: Request, res: Response) {
  const userId = currentUser(req).id;
  let input: { title: string; text: string; sourceType: 'pdf' | 'text' };

  if (req.file) {
    const fields = uploadFieldsSchema.parse(req.body ?? {});
    const { text, sourceType } = await extractFileText(req.file);
    const fallbackTitle = path.parse(req.file.originalname).name.slice(0, 120);
    input = { title: fields.title ?? fallbackTitle, text, sourceType };
  } else {
    const body = pasteSchema.parse(req.body);
    input = { ...body, sourceType: 'text' };
  }

  const doc = await knowledgeService.createDocument(userId, input);
  res.status(202).json({ document: toDocumentDTO(doc) });
}

export async function list(req: Request, res: Response) {
  const docs = await knowledgeService.listDocuments(currentUser(req).id);
  res.json({ items: docs.map(toDocumentDTO) });
}

export async function remove(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  await knowledgeService.deleteDocument(currentUser(req).id, id);
  res.status(204).end();
}
