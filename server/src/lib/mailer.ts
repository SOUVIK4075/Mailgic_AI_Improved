import nodemailer from 'nodemailer';
import { env, isProd } from '../config/env.js';
import { logger } from './logger.js';

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!transport) {
    if (isProd) throw new Error('SMTP_URL is not configured');
    // Local development without an SMTP server: print the email so the flow can still be tested.
    logger.info({ to, subject, text }, 'Email not sent (no SMTP_URL) — printed instead');
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
}
