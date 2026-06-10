import { describe, it, expect, vi, beforeAll } from 'vitest';
import { verifyAccessToken } from '../../src/modules/auth/auth.utils.ts';

vi.mock('../../src/modules/auth/auth.utils.ts', () => ({
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

describe('Socket server auth middleware', () => {
  it('rejects connection without token', async () => {
    const { initSocket } = await import('../../src/core/socket.ts');
    const fakeServer = {} as any;
    const io = initSocket(fakeServer) as any;

    const socket = makeFakeSocket({ auth: {}, query: {} });
    const next = vi.fn();
    io._middleware[0](socket, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Authentication required' }));
  });

  it('rejects connection with invalid token', async () => {
    vi.mocked(verifyAccessToken).mockImplementation(() => { throw new Error('jwt malformed'); });
    const { initSocket } = await import('../../src/core/socket.ts');
    const fakeServer = {} as any;
    const io = initSocket(fakeServer) as any;

    const socket = makeFakeSocket({ auth: { token: 'bad' } });
    const next = vi.fn();
    io._middleware[0](socket, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid or expired token' }));
  });

  it('accepts connection with valid token', async () => {
    const decoded = { id: 1, role: 'super_admin', departmentId: null };
    vi.mocked(verifyAccessToken).mockReturnValue(decoded);
    const { initSocket } = await import('../../src/core/socket.ts');
    const fakeServer = {} as any;
    const io = initSocket(fakeServer) as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    const next = vi.fn();
    io._middleware[0](socket, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('Socket connection event handlers', () => {
  it('super_admin can join any department', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ id: 1, role: 'super_admin' });
    const { initSocket } = await import('../../src/core/socket.ts');
    const io = initSocket({} as any) as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    io._middleware[0](socket, vi.fn());
    io._handlers.connection(socket);

    const joinDeptHandler = socket.on.mock.calls.find((c: any) => c[0] === 'join-department')?.[1];
    joinDeptHandler(5);
    expect(socket.join).toHaveBeenCalledWith('dept-5');
  });

  it('agent can only join own department', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ id: 2, role: 'agent', departmentId: 3 });
    const { initSocket } = await import('../../src/core/socket.ts');
    const io = initSocket({} as any) as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    io._middleware[0](socket, vi.fn());
    io._handlers.connection(socket);

    const joinDeptHandler = socket.on.mock.calls.find((c: any) => c[0] === 'join-department')?.[1];
    joinDeptHandler(3);
    expect(socket.join).toHaveBeenCalledWith('dept-3');

    joinDeptHandler(7);
    expect(socket.join).not.toHaveBeenCalledWith('dept-7');
  });

  it('user can only join own user room', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ id: 10, role: 'end_user' });
    const { initSocket } = await import('../../src/core/socket.ts');
    const io = initSocket({} as any) as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    io._middleware[0](socket, vi.fn());
    io._handlers.connection(socket);

    const joinUserHandler = socket.on.mock.calls.find((c: any) => c[0] === 'join-user')?.[1];
    joinUserHandler(10);
    expect(socket.join).toHaveBeenCalledWith('user-10');
  });

  it('any authenticated user can join a ticket room', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ id: 1, role: 'agent' });
    const { initSocket } = await import('../../src/core/socket.ts');
    const io = initSocket({} as any) as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    io._middleware[0](socket, vi.fn());
    io._handlers.connection(socket);

    const joinTicketHandler = socket.on.mock.calls.find((c: any) => c[0] === 'join-ticket')?.[1];
    joinTicketHandler(42);
    expect(socket.join).toHaveBeenCalledWith('ticket-42');
  });

  it('handles leave-ticket', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ id: 1, role: 'agent' });
    const { initSocket } = await import('../../src/core/socket.ts');
    const io = initSocket({} as any) as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    io._middleware[0](socket, vi.fn());
    io._handlers.connection(socket);

    const leaveTicketHandler = socket.on.mock.calls.find((c: any) => c[0] === 'leave-ticket')?.[1];
    leaveTicketHandler(42);
    expect(socket.leave).toHaveBeenCalledWith('ticket-42');
  });

  it('emits socket events on connection', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ id: 1, role: 'agent' });
    const { initSocket } = await import('../../src/core/socket.ts');
    const io = initSocket({} as any) as any;

    const socket = makeFakeSocket({ auth: { token: 'good' } });
    io._middleware[0](socket, vi.fn());
    io._handlers.connection(socket);

    expect(socket.on).toHaveBeenCalledWith('join-department', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('join-user', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('join-ticket', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('leave-ticket', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });
});

describe('emitTo helpers', () => {
  it('emitToDept sends to dept room', async () => {
    const { emitToDept, setIO } = await import('../../src/core/socket.ts');
    const mockIo = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
    setIO(mockIo);

    emitToDept(3, 'new-ticket', { id: 1 });
    expect(mockIo.to).toHaveBeenCalledWith('dept-3');
  });

  it('emitToUser sends to user room', async () => {
    const { emitToUser, setIO } = await import('../../src/core/socket.ts');
    const mockIo = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
    setIO(mockIo);

    emitToUser(7, 'personal', { msg: 'hi' });
    expect(mockIo.to).toHaveBeenCalledWith('user-7');
  });

  it('emitToTicket sends to ticket room', async () => {
    const { emitToTicket, setIO } = await import('../../src/core/socket.ts');
    const mockIo = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
    setIO(mockIo);

    emitToTicket(42, 'ticket-event', { status: 'open' });
    expect(mockIo.to).toHaveBeenCalledWith('ticket-42');
  });
});
