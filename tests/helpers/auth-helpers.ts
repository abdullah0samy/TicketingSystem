import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';

interface TokenPayload {
  id: number;
  role: string;
  departmentId: number | null;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '8h' });
}

export function generateExpiredToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '0s' });
}

export function generateTamperedToken(payload: TokenPayload): string {
  const token = jwt.sign(payload, ACCESS_SECRET);
  const parts = token.split('.');
  parts[2] = 'tampered';
  return parts.join('.');
}

export const superAdminToken = generateToken({ id: 1, role: 'super_admin', departmentId: null });
export const supervisorToken = generateToken({ id: 2, role: 'supervisor', departmentId: 1 });
export const agentToken = generateToken({ id: 3, role: 'agent', departmentId: 1 });
export const endUserToken = generateToken({ id: 4, role: 'end_user', departmentId: 1 });

export const supervisorDept2Token = generateToken({ id: 5, role: 'supervisor', departmentId: 2 });
export const agentDept2Token = generateToken({ id: 6, role: 'agent', departmentId: 2 });

export const tokens = {
  super_admin: superAdminToken,
  supervisor: supervisorToken,
  agent: agentToken,
  end_user: endUserToken,
  supervisor_dept2: supervisorDept2Token,
  agent_dept2: agentDept2Token,
} as const;

export function getToken(role: string, departmentId?: number | null): string {
  return generateToken({ id: Date.now(), role, departmentId: departmentId ?? null });
}
