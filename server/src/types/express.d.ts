// Adds `req.user` (set by the requireAuth middleware) to Express's Request type.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: 'user' | 'admin' };
    }
  }
}

export {};
