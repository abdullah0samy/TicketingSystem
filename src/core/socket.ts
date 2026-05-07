import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken } from '../modules/auth/auth.utils.ts';

let io: Server;

export const initSocket = (server: HttpServer) => {
  // SECURITY FIX: Restrict CORS origins to prevent unauthorized WebSocket connections
  const corsOrigins = process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL || 'https://yourdomain.com']
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

  io = new Server(server, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    }
  });

  // SECURE: Enforce authentication for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = verifyAccessToken(token as string) as any;
      (socket as any).userData = decoded;
      next();
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    const userData = (socket as any).userData;

    socket.on('join-department', (deptId: number) => {
      // BUG FIX: Validate user can join this department's room
      if (userData && (userData.role === 'super_admin' || Number(userData.departmentId) === Number(deptId))) {
        socket.join(`dept-${deptId}`);
        console.log(`Socket ${socket.id} joined department ${deptId}`);
      } else {
        console.warn(`Socket ${socket.id} denied join to department ${deptId}`);
      }
    });

    socket.on('join-user', (userId: number) => {
      // BUG FIX: Validate user can only join their own user room
      if (userData && Number(userData.id) === Number(userId)) {
        socket.join(`user-${userId}`);
        console.log(`Socket ${socket.id} joined user ${userId}`);
      } else {
        console.warn(`Socket ${socket.id} denied join to user ${userId}`);
      }
    });

    socket.on('join-ticket', (ticketId: number) => {
      if (userData) {
        socket.join(`ticket-${ticketId}`);
        console.log(`Socket ${socket.id} joined ticket ${ticketId}`);
      }
    });

    socket.on('leave-ticket', (ticketId: number) => {
      socket.leave(`ticket-${ticketId}`);
      console.log(`Socket ${socket.id} left ticket ${ticketId}`);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

export const emitToDept = (deptId: number, event: string, data: any) => {
  if (io) {
    io.to(`dept-${deptId}`).emit(event, data);
  }
};

export const emitToUser = (userId: number, event: string, data: any) => {
  if (io) {
    io.to(`user-${userId}`).emit(event, data);
  }
};

export const emitToTicket = (ticketId: number, event: string, data: any) => {
  if (io) {
    io.to(`ticket-${ticketId}`).emit(event, data);
  }
};