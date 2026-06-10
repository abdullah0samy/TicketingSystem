import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
}

vi.mock('socket.io-client', () => {
  const mockSocket = {
    on: vi.fn().mockReturnThis(),
    emit: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
    removeAllListeners: vi.fn().mockReturnThis(),
    io: vi.fn().mockReturnThis(),
    id: 'mock-socket-id',
    connected: true,
  };
  return {
    default: vi.fn(() => mockSocket),
    io: vi.fn(() => mockSocket),
  };
});
