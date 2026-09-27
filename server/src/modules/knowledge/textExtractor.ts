import path from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { AppError } from '../../lib/errors.js';

export const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md'];

export async function extractFileText(file: Express.Multer.File): Promise<{ text: string; sourceType: 'pdf' | 'text' }> {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return { text, sourceType: 'pdf' };
  }
  if (ext === '.txt' || ext === '.md') {
    return { text: file.buffer.toString('utf8'), sourceType: 'text' };
  }
  throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only .pdf, .txt and .md files are supported');
}
