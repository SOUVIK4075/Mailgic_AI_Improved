import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import * as auth from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/signup', authLimiter, auth.signup);
authRouter.post('/login', authLimiter, auth.login);
authRouter.post('/refresh', auth.refresh);
authRouter.post('/logout', auth.logout);
authRouter.get('/me', requireAuth, auth.me);
authRouter.post('/forgot-password', authLimiter, auth.forgotPassword);
authRouter.post('/reset-password', authLimiter, auth.resetPassword);
