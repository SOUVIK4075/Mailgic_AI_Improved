import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const sentMail = vi.hoisted(() => [] as { to: string; text: string }[]);
vi.mock('../src/lib/mailer.js', () => ({
  sendMail: async (to: string, _subject: string, text: string) => {
    sentMail.push({ to, text });
  },
}));

import { app, signedInAgent } from './helpers.js';
import { UserModel } from '../src/models/User.js';

const cookieNames = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split('=')[0]);

describe('auth', () => {
  it('signs up, sets httpOnly cookies and never returns the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Souvik', email: 'Souvik@Test.dev', password: 'password123' })
      .expect(201);

    expect(res.body.user).toMatchObject({ name: 'Souvik', email: 'souvik@test.dev', role: 'user' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(cookieNames(res)).toEqual(expect.arrayContaining(['access_token', 'refresh_token']));
    expect(String(res.headers['set-cookie'])).toContain('HttpOnly');
  });

  it('rejects invalid input with field-level details', async () => {
    const res = await request(app).post('/api/auth/signup').send({ name: '', email: 'nope', password: '123' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['name', 'email', 'password']),
    );
  });

  it('returns 409 for a duplicate email', async () => {
    await signedInAgent({ email: 'dup@test.dev' });
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Again', email: 'dup@test.dev', password: 'password123' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('logs in with correct credentials and rejects wrong ones with the same message', async () => {
    await signedInAgent({ email: 'login@test.dev' });
    await request(app).post('/api/auth/login').send({ email: 'login@test.dev', password: 'password123' }).expect(200);

    const wrongPw = await request(app).post('/api/auth/login').send({ email: 'login@test.dev', password: 'nope' }).expect(401);
    const noUser = await request(app).post('/api/auth/login').send({ email: 'ghost@test.dev', password: 'nope' }).expect(401);
    expect(wrongPw.body.error.message).toBe(noUser.body.error.message);
  });

  it('protects /me and tells the client when the access token expired', async () => {
    await request(app).get('/api/auth/me').expect(401);

    const { agent, user } = await signedInAgent();
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.id).toBe(user.id);

    const expired = jwt.sign({ role: 'user' }, process.env.JWT_ACCESS_SECRET!, { subject: user.id, expiresIn: -10 });
    const res = await request(app).get('/api/auth/me').set('Cookie', `access_token=${expired}`).expect(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rotates refresh tokens: an old refresh token cannot be reused', async () => {
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Rotator', email: 'rotate@test.dev', password: 'password123' })
      .expect(201);
    const refreshCookie = ([] as string[])
      .concat(signup.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('refresh_token='))!
      .split(';')[0]!;

    await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie).expect(200);
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie).expect(401);
    expect(reuse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('logout revokes the session', async () => {
    const { agent } = await signedInAgent();
    await agent.post('/api/auth/logout').expect(204);
    await agent.post('/api/auth/refresh').expect(401);
  });

  it('resets a password with an emailed token and logs out other sessions', async () => {
    const { agent } = await signedInAgent({ email: 'reset@test.dev' });

    await request(app).post('/api/auth/forgot-password').send({ email: 'reset@test.dev' }).expect(200);
    // Unknown email gets the same answer (no account enumeration).
    await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@test.dev' }).expect(200);
    expect(sentMail).toHaveLength(1);

    const token = sentMail[0]!.text.match(/token=([\w-]+)/)![1]!;
    await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-pass' }).expect(200);

    await agent.post('/api/auth/refresh').expect(401); // old session revoked
    await request(app).post('/api/auth/login').send({ email: 'reset@test.dev', password: 'brand-new-pass' }).expect(200);
    await request(app).post('/api/auth/reset-password').send({ token, password: 'another-pass' }).expect(400); // one-time use
  });

  it('only admins can read admin stats', async () => {
    const { agent, user } = await signedInAgent();
    await agent.get('/api/admin/stats').expect(403);

    await UserModel.updateOne({ _id: user.id }, { role: 'admin' });
    await agent.post('/api/auth/refresh').expect(200); // new access token carries the new role
    const res = await agent.get('/api/admin/stats').expect(200);
    expect(res.body).toMatchObject({ users: 1 });
  });
});
