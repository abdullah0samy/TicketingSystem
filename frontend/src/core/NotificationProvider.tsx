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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user, accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const langRef = useRef(language);
  langRef.current = language;

  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

    newSocket.on('connect', () => {
      reconnectAttemptsRef.current = 0;
      newSocket.emit('join-user', currentUser.id);
      if (currentUser.departmentId) {
        newSocket.emit('join-department', currentUser.departmentId);
      }
    });

    newSocket.on('disconnect', () => {
    });

    newSocket.on('connect_error', (err) => {
      reconnectAttemptsRef.current++;
    });

    newSocket.on('new-ticket', (data: any) => {
      window.dispatchEvent(new CustomEvent('ws:ticket-created', { detail: data }));
      addNotification({
        title: langRef.current === 'ar' ? 'تذكرة جديدة' : 'New Ticket',
        message: `${data.ticketNumber}: ${data.subject}`,
        type: 'info',
        link: `/tickets/${data.id}`
      });
    });

    newSocket.on('ticket-status-updated', (data: any) => {
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

    newSocket.on('ticket-assigned', (data: any) => {
      window.dispatchEvent(new CustomEvent('ws:ticket-assigned', { detail: data }));
      addNotification({
        title: langRef.current === 'ar' ? 'تم تعيين تذكرة لك' : 'Ticket Assigned to You',
        message: `${data.ticketNumber}: ${data.subject}`,
        type: 'warning',
        link: `/tickets/${data.id}`
      });
    });

    newSocket.on('new-comment', (data: any) => {
      window.dispatchEvent(new CustomEvent('ws:new-comment', { detail: data }));
      addNotification({
        title: langRef.current === 'ar' ? 'تعليق جديد' : 'New Comment',
        message: `${data.ticketNumber}: ${data.message.body?.substring(0, 50)}${data.message.body?.length > 50 ? '...' : ''}`,
        type: 'info',
        link: `/tickets/${data.ticketId}`
      });
    });

    newSocket.on('sla-warning', (data: any) => {
      addNotification({
        title: langRef.current === 'ar' ? 'تنبيه SLA' : 'SLA Warning',
        message: `${data.ticketNumber}: ${data.percentage}% of SLA time consumed!`,
        type: 'warning',
        link: `/tickets/${data.id}`
      });
    });

    newSocket.on('sla-breach', (data: any) => {
      addNotification({
        title: langRef.current === 'ar' ? 'خرق SLA' : 'SLA Breach',
        message: `${data.ticketNumber}: SLA has been breached!`,
        type: 'error',
        link: `/tickets/${data.id}`
      });
    });

    socketRef.current = newSocket;
  }, [addNotification]);

  useEffect(() => {
    if (accessToken && user) {
      connectSocket();
    }

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [accessToken, user?.id, user?.departmentId, connectSocket]);

  // Request notification permission on mount
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
