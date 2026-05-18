import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  createdAt: Date;
  read: boolean;
  link?: string;
  ticketId?: number;
  status?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  toasts: Notification[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  removeToast: (id: string) => void;
  addNotification: (notif: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 2000;
const TOAST_DURATION = 6000;
const MAX_NOTIFICATIONS = 100;

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const { user, accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const langRef = useRef(language);
  langRef.current = language;

  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const seenEventsRef = useRef<Set<string>>(new Set());

  const deduplicateKey = useCallback((event: string, data: any) => {
    return `${event}-${data.id ?? ''}-${data.ticketNumber ?? ''}-${data.ticketId ?? ''}`;
  }, []);

  const removeToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addNotification = useCallback((notif: Omit<Notification, 'id' | 'createdAt' | 'read'>) => {
    const currentLang = langRef.current;
    const newNotif: Notification = {
      ...notif,
      id: crypto.randomUUID?.() || Math.random().toString(36).substring(7),
      createdAt: new Date(),
      read: false
    };
    setNotifications(prev => {
      const updated = [newNotif, ...prev];
      return updated.length > MAX_NOTIFICATIONS ? updated.slice(0, MAX_NOTIFICATIONS) : updated;
    });
    setToasts(prev => [...prev, newNotif]);

    const timer = setTimeout(() => {
      toastTimersRef.current.delete(newNotif.id);
      setToasts(prev => prev.filter(t => t.id !== newNotif.id));
    }, TOAST_DURATION);
    toastTimersRef.current.set(newNotif.id, timer);

    if (typeof window.Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(newNotif.title, { body: newNotif.message });
    }
  }, []);

  const registerSocketListeners = useCallback((socket: Socket, currentUser: any) => {
    const handleEvent = (event: string, data: any, handler: () => void) => {
      const key = deduplicateKey(event, data);
      if (seenEventsRef.current.has(key)) return;
      seenEventsRef.current.add(key);
      setTimeout(() => seenEventsRef.current.delete(key), 5000);
      handler();
    };

    socket.on('connect', () => {
      reconnectAttemptsRef.current = 0;
      socket.emit('join-user', currentUser.id);
      if (currentUser.departmentId) {
        socket.emit('join-department', currentUser.departmentId);
      }
    });

    socket.on('disconnect', () => {});

    socket.on('connect_error', () => {
      reconnectAttemptsRef.current++;
    });

    socket.on('new-ticket', (data: any) => {
      handleEvent('new-ticket', data, () => {
        addNotification({
          title: langRef.current === 'ar' ? 'تذكرة جديدة' : 'New Ticket',
          message: `${data.ticketNumber}: ${data.subject}`,
          type: 'info',
          link: `/tickets/${data.id}`
        });
      });
    });

    socket.on('ticket-status-updated', (data: any) => {
      handleEvent('ticket-status-updated', data, () => {
        window.dispatchEvent(new CustomEvent('ws:ticket-status-updated', { detail: data }));
        const isResolved = data.status === 'resolved';
        addNotification({
          title: langRef.current === 'ar' ? 'تحديث حالة التذكرة' : 'Ticket Status Updated',
          message: `${data.ticketNumber} is now ${data.status}`,
          type: 'success',
          link: `/tickets/${data.id}${isResolved ? '?confirm=true' : ''}`,
          ticketId: data.id,
          status: data.status
        });
      });
    });

    socket.on('ticket-assigned', (data: any) => {
      handleEvent('ticket-assigned', data, () => {
        window.dispatchEvent(new CustomEvent('ws:ticket-assigned', { detail: data }));
        addNotification({
          title: langRef.current === 'ar' ? 'تم تعيين تذكرة لك' : 'Ticket Assigned to You',
          message: `${data.ticketNumber}: ${data.subject}`,
          type: 'warning',
          link: `/tickets/${data.id}`
        });
      });
    });

    socket.on('new-comment', (data: any) => {
      handleEvent('new-comment', data, () => {
        window.dispatchEvent(new CustomEvent('ws:new-comment', { detail: data }));
        addNotification({
          title: langRef.current === 'ar' ? 'تعليق جديد' : 'New Comment',
          message: `${data.ticketNumber}: ${data.message.body?.substring(0, 50)}${data.message.body?.length > 50 ? '...' : ''}`,
          type: 'info',
          link: `/tickets/${data.ticketId}`
        });
      });
    });

    socket.on('sla-warning', (data: any) => {
      handleEvent('sla-warning', data, () => {
        addNotification({
          title: langRef.current === 'ar' ? 'تنبيه SLA' : 'SLA Warning',
          message: `${data.ticketNumber}: ${data.percentage}% of SLA time consumed!`,
          type: 'warning',
          link: `/tickets/${data.id}`
        });
      });
    });

    socket.on('sla-breach', (data: any) => {
      handleEvent('sla-breach', data, () => {
        addNotification({
          title: langRef.current === 'ar' ? 'خرق SLA' : 'SLA Breach',
          message: `${data.ticketNumber}: SLA has been breached!`,
          type: 'error',
          link: `/tickets/${data.id}`
        });
      });
    });

    socket.on('ticket-closed', (data: any) => {
      handleEvent('ticket-closed', data, () => {
        window.dispatchEvent(new CustomEvent('ws:ticket-closed', { detail: data }));
        addNotification({
          title: langRef.current === 'ar' ? 'تم إغلاق التذكرة' : 'Ticket Closed',
          message: `${data.ticketNumber} has been closed`,
          type: 'success',
          link: `/tickets/${data.id}`
        });
      });
    });
  }, [addNotification, deduplicateKey]);

  const connectSocket = useCallback(() => {
    const currentToken = useAuthStore.getState().accessToken;
    const currentUser = useAuthStore.getState().user;
    if (!currentToken || !currentUser) return;

    if (socketRef.current?.connected) return;

    socketRef.current?.disconnect();
    socketRef.current?.removeAllListeners();

    const newSocket = io(window.location.origin, {
      auth: { token: currentToken },
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY,
      reconnectionDelayMax: 10000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });

    registerSocketListeners(newSocket, currentUser);

    socketRef.current = newSocket;
  }, [registerSocketListeners]);

  useEffect(() => {
    if (accessToken && user) {
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit('reauthenticate', accessToken, (ok: boolean) => {
          if (!ok) {
            socket.disconnect();
            connectSocket();
          }
        });
      } else {
        connectSocket();
      }
    }

    return () => {
      for (const [, timer] of toastTimersRef.current) {
        clearTimeout(timer);
      }
      toastTimersRef.current.clear();
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [accessToken, user?.id, connectSocket]);

  useEffect(() => {
    if (typeof window.Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      toasts,
      markAsRead,
      markAllAsRead,
      clearNotifications,
      removeToast,
      addNotification,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
