/*
 * DEPRECATED: This helper was designed for the old Express backend.
 * NestJS tests create apps inline via Test.createTestingModule().
 * Kept to avoid breaking imports until old Express tests are migrated.
 */
import { superAdminToken, supervisorToken, agentToken, endUserToken, tokens } from './auth-helpers.ts';
