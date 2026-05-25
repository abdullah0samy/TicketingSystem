import { doubleCsrf } from 'csrf-csrf';
import type { Request, Response, NextFunction } from 'express';

const CSRF_SECRET = process.env.CSRF_SECRET;
if (!CSRF_SECRET) {
  console.error(
    'CSRF_SECRET environment variable is required. ' +
    'Generate one with: openssl rand -hex 32'
  );
  process.exit(1);
}

const {
  generateCsrfToken,
  doubleCsrfProtection,
  invalidCsrfTokenError,
} = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  getSessionIdentifier: () => '',
  cookieName: 'x-csrf-token',
  cookieOptions: {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
  size: 64,
  getCsrfTokenFromRequest: (req: Request) => req.headers['x-csrf-token'] as string | undefined,
});

function csrfErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err === invalidCsrfTokenError) {
    res.status(403).json({
      message: 'Invalid CSRF token. Please refresh the page and try again.',
      code: 'CSRF_TOKEN_INVALID',
    });
    return;
  }
  next(err);
}

function csrfTokenEndpoint(req: Request, res: Response): void {
  const token = generateCsrfToken(req, res);
  res.json({ csrfToken: token });
}

export {
  generateCsrfToken as generateToken,
  doubleCsrfProtection,
  csrfErrorHandler,
  csrfTokenEndpoint,
};
