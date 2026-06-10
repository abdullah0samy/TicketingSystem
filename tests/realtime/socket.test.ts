import { describe, it, expect, vi, beforeAll } from 'vitest';
import { verifyAccessToken } from '../../src/modules/auth/auth.utils';

vi.mock('../../src/modules/auth/auth.utils', () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock('socket.io', () => {
  function MockServer() {
    const middleware: any[] = [];
    const handlers: Record<string, any> = {};
    const instance = {
      use: vi.fn((fn: any) => middleware.push(fn)),
      on: vi.fn((event: string, handler: any) => { handlers[event] = handler; }),
      to: vi.fn(() => ({ emit: vi.fn() })),
      _middleware: middleware,
      _handlers: handlers,
    };
    return instance;
  }
  MockServer.prototype.constructor = MockServer;
  return { Server: MockServer };
});

function makeFakeSocket(data?: any) {
  const s: any = {
    id: 'mock-id',
    handshake: { auth: {}, query: {} },
    join: vi.fn(),
    leave: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    rooms: new Set(),
  };
  if (data) s.handshake = data;
  return s;
}

describe('Socket server auth middleware (gateway handleConnection)', () => {
  it('rejects connection without token', async () => {
    const { TicketGateway } = await import('../../src/gateways/ticket.gateway');
    const gateway = new TicketGateway();
    gateway.server = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } as any;

    const socket = makeFakeSocket({ auth: {}, query: {} });
    gateway.handleConnection(socket);
    expect(socket.emit).toHaveBeenCalledWith('error', 'Authentication required');
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('rejects connection with invalid token', async () => {
    vi.mocked(verifyAccessToken).mockImplementation(() => { throw new Error('jwt malformed'); });
    const { TicketGateway } = await import('../../src/gateways/ticket.gateway');
    const gateway = new TicketGateway();
    gateway.server = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } as any;

    const socket = makeFakeSocket({ auth: { token: 'bad' } });
    gateway.handleConnection(socket);
    expect(socket.emit).toHaveBeenCalledWith('error', 'Invalid or expired token');
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('accepts connection with valid token', async () => {
    const decoded = { id: 1, role: 'super_admin', departmentId: null };
    vi.mocked(verifyAccessToken).mockReturnValue(decoded);
    const { TicketGateway } = await import('../../src/gateways/ticket.gateway');
    const gateway = new TicketGateway();
    gateway.server = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    gateway.handleConnection(socket);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect((socket as any).userData).toEqual(decoded);
  });
});

describe('Socket connection event handlers', () => {
  it('super_admin can join any department', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ id: 1, role: 'super_admin' });
    const { TicketGateway } = await import('../../src/gateways/ticket.gateway');
    const gateway = new TicketGateway();
    gateway.server = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    gateway.handleConnection(socket);
    gateway.handleJoinDepartment(socket, 5);
    expect(socket.join).toHaveBeenCalledWith('dept-5');
  });

  it('agent can only join own department', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ id: 2, role: 'agent', departmentId: 3 });
    const { TicketGateway } = await import('../../src/gateways/ticket.gateway');
    const gateway = new TicketGateway();
    gateway.server = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    gateway.handleConnection(socket);
    gateway.handleJoinDepartment(socket, 3);
    expect(socket.join).toHaveBeenCalledWith('dept-3');
    gateway.handleJoinDepartment(socket, 7);
    expect(socket.join).not.toHaveBeenCalledWith('dept-7');
  });

  it('user can only join own user room', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ id: 10, role: 'end_user' });
    const { TicketGateway } = await import('../../src/gateways/ticket.gateway');
    const gateway = new TicketGateway();
    gateway.server = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    gateway.handleConnection(socket);
    gateway.handleJoinUser(socket, 10);
    expect(socket.join).toHaveBeenCalledWith('user-10');
  });

  it('any authenticated user can join a ticket room', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ id: 1, role: 'agent' });
    const { TicketGateway } = await import('../../src/gateways/ticket.gateway');
    const gateway = new TicketGateway();
    gateway.server = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    gateway.handleConnection(socket);
    gateway.handleJoinTicket(socket, 42);
    expect(socket.join).toHaveBeenCalledWith('ticket-42');
  });

  it('handles leave-ticket', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ id: 1, role: 'agent' });
    const { TicketGateway } = await import('../../src/gateways/ticket.gateway');
    const gateway = new TicketGateway();
    gateway.server = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    gateway.handleConnection(socket);
    gateway.handleLeaveTicket(socket, 42);
    expect(socket.leave).toHaveBeenCalledWith('ticket-42');
  });
});

describe('emitTo helpers', () => {
  it('emitToDept sends to dept room', async () => {
    const { TicketGateway } = await import('../../src/gateways/ticket.gateway');
    const gateway = new TicketGateway();
    const mockIo = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
    gateway.server = mockIo as any;

    gateway.emitToDept(3, 'new-ticket', { id: 1 });
    expect(mockIo.to).toHaveBeenCalledWith('dept-3');
  });

  it('emitToUser sends to user room', async () => {
    const { TicketGateway } = await import('../../src/gateways/ticket.gateway');
    const gateway = new TicketGateway();
    const mockIo = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
    gateway.server = mockIo as any;

    gateway.emitToUser(7, 'personal', { msg: 'hi' });
    expect(mockIo.to).toHaveBeenCalledWith('user-7');
  });

  it('emitToTicket sends to ticket room', async () => {
    const { TicketGateway } = await import('../../src/gateways/ticket.gateway');
    const gateway = new TicketGateway();
    const mockIo = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
    gateway.server = mockIo as any;

    gateway.emitToTicket(42, 'ticket-event', { status: 'open' });
    expect(mockIo.to).toHaveBeenCalledWith('ticket-42');
  });
});
