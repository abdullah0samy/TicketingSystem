import request from 'supertest';
import app from '../../src/app.ts';
import { superAdminToken, supervisorToken, agentToken, endUserToken, tokens } from './auth-helpers.ts';

type RoleKey = keyof typeof tokens;

function createAgent(headers?: Record<string, string>) {
  const agent = request.agent(app);
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      agent.set(key, value);
    }
  }
  return agent;
}

export function authRequest(token: string) {
  return createAgent({ Authorization: `Bearer ${token}` });
}

export const adminRequest = authRequest(superAdminToken);
export const supervisorRequest = authRequest(supervisorToken);
export const agentRequest = authRequest(agentToken);
export const userRequest = authRequest(endUserToken);

export function requestAs(role: RoleKey) {
  return authRequest(tokens[role]);
}

export function unauthenticatedRequest() {
  return createAgent();
}

export { request };
