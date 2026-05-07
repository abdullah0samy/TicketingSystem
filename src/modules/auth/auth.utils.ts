import jwt from 'jsonwebtoken';

// CRITICAL: Fail fast if JWT secrets are not properly configured
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  console.error(
    '🔴 CRITICAL: JWT secrets must be configured via environment variables!\n' +
    '   Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET before starting the server.\n' +
    '   In production, use strong 64+ character random strings.\n' +
    '   Example: JWT_ACCESS_SECRET=$(openssl rand -base64 32)'
  );
  process.exit(1);
}

export const generateAccessToken = (user: any) => {
  return jwt.sign(
    { id: user.id, role: user.role, departmentId: user.departmentId },
    ACCESS_SECRET,
    { expiresIn: '8h' }
  );
};

export const generateRefreshToken = (user: any) => {
  return jwt.sign(
    { id: user.id },
    REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, ACCESS_SECRET);
};

export const verifyRefreshToken = (token: string) => {
  return jwt.verify(token, REFRESH_SECRET);
};
