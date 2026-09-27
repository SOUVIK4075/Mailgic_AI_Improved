import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();

let counter = 0;

// Signs up a fresh user and returns a supertest agent that keeps its auth cookies.
export async function signedInAgent(overrides: { email?: string; name?: string } = {}) {
  const agent = request.agent(app);
  const email = overrides.email ?? `user${++counter}@test.dev`;
  const res = await agent
    .post('/api/auth/signup')
    .send({ name: overrides.name ?? 'Test User', email, password: 'password123' })
    .expect(201);
  return { agent, user: res.body.user as { id: string; email: string; name: string } };
}
