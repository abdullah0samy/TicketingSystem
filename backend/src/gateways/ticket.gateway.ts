import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../modules/auth/auth.utils';

interface RateLimitEntry {
  timestamps: number[];
}

const RATE_LIMITS: Map<string, Map<string, RateLimitEntry>> = new Map();

function checkRateLimit(socketId: string, event: string, maxRequests: number, windowMs: number): boolean {
  if (!RATE_LIMITS.has(socketId)) {
    RATE_LIMITS.set(socketId, new Map());
  }
  const socketLimits = RATE_LIMITS.get(socketId)!;
  if (!socketLimits.has(event)) {
    socketLimits.set(event, { timestamps: [] });
  }
  const entry = socketLimits.get(event)!;
  const now = Date.now();
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);
  if (entry.timestamps.length >= maxRequests) return false;
  entry.timestamps.push(now);
  return true;
}

const CORS_ORIGINS = process.env.NODE_ENV === 'production'
  ? [process.env.FRONTEND_URL || 'https://yourdomain.com']
  : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

@WebSocketGateway({
  cors: { origin: CORS_ORIGINS, methods: ['GET', 'POST'], credentials: true },
})
export class TicketGateway {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    if (!token) {
      client.emit('error', 'Authentication required');
      client.disconnect();
      return;
    }
    try {
      const decoded = verifyAccessToken(token as string) as any;
      (client as any).userData = decoded;
    } catch (err) {
      client.emit('error', 'Invalid or expired token');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    RATE_LIMITS.delete(client.id);
  }

  @SubscribeMessage('join-department')
  handleJoinDepartment(client: Socket, deptId: number) {
    const userData = (client as any).userData;
    if (userData && (userData.role === 'super_admin' || Number(userData.departmentId) === Number(deptId))) {
      client.join(`dept-${deptId}`);
    }
  }

  @SubscribeMessage('join-user')
  handleJoinUser(client: Socket, userId: number) {
    const userData = (client as any).userData;
    if (userData && Number(userData.id) === Number(userId)) {
      client.join(`user-${userId}`);
    }
  }

  @SubscribeMessage('join-ticket')
  handleJoinTicket(client: Socket, ticketId: number) {
    if (!checkRateLimit(client.id, 'join-ticket', 5, 1000)) return;
    const userData = (client as any).userData;
    if (userData) {
      client.join(`ticket-${ticketId}`);
    }
  }

  @SubscribeMessage('leave-ticket')
  handleLeaveTicket(client: Socket, ticketId: number) {
    client.leave(`ticket-${ticketId}`);
  }

  emitToDept(deptId: number, event: string, data: any) {
    this.server?.to(`dept-${deptId}`).emit(event, data);
  }

  emitToUser(userId: number, event: string, data: any) {
    this.server?.to(`user-${userId}`).emit(event, data);
  }

  emitToTicket(ticketId: number, event: string, data: any) {
    this.server?.to(`ticket-${ticketId}`).emit(event, data);
  }
}
