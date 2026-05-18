import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken } from '../modules/auth/auth.utils.ts';
import prisma from './db.ts';

let io: Server;

const SOCKET_TOKEN_TIMEOUT = 15000;

export const initSocket = (server: HttpServer) => {
  const corsOrigins = process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL || 'https://yourdomain.com']
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

  io = new Server(server, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = verifyAccessToken(token) as any;
      socket.data.user = decoded;
      socket.data.authenticatedAt = Date.now();
      next();
    } catch {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log(`🔌 User connected: ${user.id} (${socket.id})`);

    socket.on('join-department', async (deptId: number) => {
      if (user.role === 'super_admin' || Number(user.departmentId) === Number(deptId)) {
        socket.join(`dept-${deptId}`);
      }
    });

    socket.on('join-user', async (userId: number) => {
      if (Number(user.id) === Number(userId)) {
        socket.join(`user-${userId}`);
      }
    });

    socket.on('join-ticket', async (ticketId: number) => {
      try {
        const ticket = await prisma.ticket.findUnique({
          where: { id: Number(ticketId) },
          select: { departmentId: true, createdById: true, assignedToId: true }
        });
        if (!ticket) return;

        const isCreator = Number(ticket.createdById) === Number(user.id);
        const isAssigned = ticket.assignedToId && Number(ticket.assignedToId) === Number(user.id);
        const isDeptMember = user.departmentId && Number(ticket.departmentId) === Number(user.departmentId);
        const isAdmin = user.role === 'super_admin';

        if (isCreator || isAssigned || isDeptMember || isAdmin) {
          socket.join(`ticket-${ticketId}`);
        }
      } catch {
        // Silently deny on DB error
      }
    });

    socket.on('leave-ticket', (ticketId: number) => {
      socket.leave(`ticket-${ticketId}`);
    });

    socket.on('reauthenticate', async (newToken: string, cb: (ok: boolean) => void) => {
      try {
        const decoded = verifyAccessToken(newToken) as any;
        if (Number(decoded.id) !== Number(user.id)) {
          cb(false);
          return;
        }
        socket.data.user = decoded;
        socket.data.authenticatedAt = Date.now();
        cb(true);
      } catch {
        cb(false);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 User disconnected: ${user.id} (${socket.id}) — ${reason}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initSocket() before getIO().');
  }
  return io;
};

export const emitToDept = (deptId: number, event: string, data: any) => {
  if (io) io.to(`dept-${deptId}`).emit(event, data);
};

export const emitToUser = (userId: number, event: string, data: any) => {
  if (io) io.to(`user-${userId}`).emit(event, data);
};

export const emitToTicket = (ticketId: number, event: string, data: any) => {
  if (io) io.to(`ticket-${ticketId}`).emit(event, data);
};