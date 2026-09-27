import { z } from 'zod';

// Validates a MongoDB ObjectId *before* it reaches the database, so a bad id is a clean 400.
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamSchema = z.object({ id: objectId });
