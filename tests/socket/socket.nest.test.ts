import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { GatewaysModule } from '../../src/gateways/gateways.module';
import { TicketGateway } from '../../src/gateways/ticket.gateway';
import { verifyAccessToken } from '../../src/modules/auth/auth.utils';
import type { INestApplication } from '@nestjs/common';
import type { Socket } from 'socket.io';

vi.mock('../../src/modules/auth/auth.utils', () => ({
  verifyAccessToken: vi.fn(),
}));

function createMockSocket(id: string, token?: string): any {
  return {
    id,
    handshake: {
      auth: { token },
      query: {},
    },
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe('NestJS Socket Gateway', () => {
  let app: INestApplication;
  let gateway: TicketGateway;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GatewaysModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    gateway = app.get(TicketGateway);
  }, 20000);

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('handleConnection', () => {
    it('accepts connection with valid token', () => {
      const mockDecoded = { id: 1, role: 'agent', departmentId: 1 };
      (verifyAccessToken as any).mockReturnValue(mockDecoded);
      const socket = createMockSocket('s1', 'valid-token');

      gateway.handleConnection(socket);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect((socket as any).userData).toEqual(mockDecoded);
    });

    it('rejects connection without token', () => {
      const socket = createMockSocket('s2');

      gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', 'Authentication required');
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('rejects connection with invalid token', () => {
      (verifyAccessToken as any).mockImplementation(() => { throw new Error('Invalid token'); });
      const socket = createMockSocket('s3', 'bad-token');

      gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', 'Invalid or expired token');
      expect(socket.disconnect).toHaveBeenCalled();
    });
  });

  describe('join-department', () => {
    it('allows super_admin to join any department', () => {
      const socket = createMockSocket('s4');
      (socket as any).userData = { id: 1, role: 'super_admin' };

      gateway.handleJoinDepartment(socket, 5);

      expect(socket.join).toHaveBeenCalledWith('dept-5');
    });

    it('allows user to join own department', () => {
      const socket = createMockSocket('s5');
      (socket as any).userData = { id: 2, role: 'agent', departmentId: 3 };

      gateway.handleJoinDepartment(socket, 3);

      expect(socket.join).toHaveBeenCalledWith('dept-3');
    });

    it('denies user from joining other department', () => {
      const socket = createMockSocket('s6');
      (socket as any).userData = { id: 2, role: 'agent', departmentId: 3 };

      gateway.handleJoinDepartment(socket, 7);

      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('join-user', () => {
    it('allows user to join own room', () => {
      const socket = createMockSocket('s7');
      (socket as any).userData = { id: 10 };

      gateway.handleJoinUser(socket, 10);

      expect(socket.join).toHaveBeenCalledWith('user-10');
    });

    it('denies user from joining another user room', () => {
      const socket = createMockSocket('s8');
      (socket as any).userData = { id: 10 };

      gateway.handleJoinUser(socket, 20);

      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('join-ticket', () => {
    it('allows any authenticated user', () => {
      const socket = createMockSocket('s9');
      (socket as any).userData = { id: 1 };

      gateway.handleJoinTicket(socket, 100);

      expect(socket.join).toHaveBeenCalledWith('ticket-100');
    });
  });

  describe('leave-ticket', () => {
    it('leaves the ticket room', () => {
      const socket = createMockSocket('s10');

      gateway.handleLeaveTicket(socket, 100);

      expect(socket.leave).toHaveBeenCalledWith('ticket-100');
    });
  });

  describe('emit helpers', () => {
    it('emitToDept emits to dept room', () => {
      const mockServer = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
      (gateway as any).server = mockServer;

      gateway.emitToDept(1, 'test-event', { foo: 'bar' });

      expect(mockServer.to).toHaveBeenCalledWith('dept-1');
    });

    it('emitToUser emits to user room', () => {
      const mockServer = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
      (gateway as any).server = mockServer;

      gateway.emitToUser(5, 'user-event', { msg: 'hello' });

      expect(mockServer.to).toHaveBeenCalledWith('user-5');
    });

    it('emitToTicket emits to ticket room', () => {
      const mockServer = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
      (gateway as any).server = mockServer;

      gateway.emitToTicket(42, 'ticket-update', { status: 'resolved' });

      expect(mockServer.to).toHaveBeenCalledWith('ticket-42');
    });

    it('emit helpers handle null server gracefully', () => {
      (gateway as any).server = null;
      expect(() => gateway.emitToDept(1, 'e', {})).not.toThrow();
      expect(() => gateway.emitToUser(1, 'e', {})).not.toThrow();
      expect(() => gateway.emitToTicket(1, 'e', {})).not.toThrow();
    });
  });
});
