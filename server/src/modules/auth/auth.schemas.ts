import { z } from 'zod';

const email = z.email('Please enter a valid email').trim().toLowerCase();
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
