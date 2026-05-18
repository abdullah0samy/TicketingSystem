import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

if (!ACCESS_SECRET) {
  console.error('🔴 CRITICAL: JWT_ACCESS_SECRET must be configured via environment variables!');
  process.exit(1);
}

export const generateAccessToken = (user: any) => {
  return jwt.sign(
    { id: user.id, role: user.role, departmentId: user.departmentId },
    ACCESS_SECRET,
    { expiresIn: '8h' }
  );
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, ACCESS_SECRET);
};

