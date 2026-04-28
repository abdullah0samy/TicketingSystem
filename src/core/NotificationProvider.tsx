import React, { createContext, useContext, useEffect, useState } from 'react';
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

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const { user, accessToken } = useAuthStore();
  const { language } = useSettingsStore();

  useEffect(() => {
    if (accessToken && user) {
      const newSocket = io(window.location.origin, {
        auth: { token: accessToken }, // Send JWT for authenticated socket rooms
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });
      setSocket(newSocket);

      newSocket.on('connect', () => {
        newSocket.emit('join-user', user.id);
        if (user.departmentId) {
          newSocket.emit('join-department', user.departmentId);
        }
      });

      newSocket.on('new-ticket', (data: any) => {
        addNotification({
          title: language === 'ar' ? 'تذكرة جديدة' : 'New Ticket',
          message: `${data.ticketNumber}: ${data.subject}`,
          type: 'info',
          link: `/tickets/${data.id}`
        });
      });

      newSocket.on('ticket-status-updated', (data: any) => {
        // Bridge event for TicketDetailsPage to receive without its own socket
        window.dispatchEvent(new CustomEvent('ws:ticket-status-updated', { detail: data }));
        const isResolved = data.status === 'resolved';
        addNotification({
          title: language === 'ar' ? 'تحديث حالة التذكرة' : 'Ticket Status Updated',
          message: `${data.ticketNumber} is now ${data.status}`,
          type: 'success',
          link: `/tickets/${data.id}${isResolved ? '?confirm=true' : ''}`,
          ticketId: data.id,
          status: data.status
        });
      });

      newSocket.on('ticket-assigned', (data: any) => {
        // Bridge event for TicketDetailsPage to receive without its own socket
        window.dispatchEvent(new CustomEvent('ws:ticket-assigned', { detail: data }));
        addNotification({
          title: language === 'ar' ? 'تم تعيين تذكرة لك' : 'Ticket Assigned to You',
          message: `${data.ticketNumber}: ${data.subject}`,
          type: 'warning',
          link: `/tickets/${data.id}`
        });
      });

      newSocket.on('new-comment', (data: any) => {
        // Bridge event for TicketDetailsPage to receive without its own socket
        window.dispatchEvent(new CustomEvent('ws:new-comment', { detail: data }));
        addNotification({
          title: language === 'ar' ? 'تعليق جديد' : 'New Comment',
          message: `${data.ticketNumber}: ${data.message.body?.substring(0, 50)}${data.message.body?.length > 50 ? '...' : ''}`,
          type: 'info',
          link: `/tickets/${data.ticketId}`
        });
      });
      
      newSocket.on('sla-warning', (data: any) => {
        addNotification({
          title: language === 'ar' ? 'تنبيه SLA' : 'SLA Warning',
          message: `${data.ticketNumber}: ${data.percentage}% of SLA time consumed!`,
          type: 'warning',
          link: `/tickets/${data.id}`
        });
      });

      newSocket.on('sla-breach', (data: any) => {
        addNotification({
          title: language === 'ar' ? 'خرق SLA' : 'SLA Breach',
          message: `${data.ticketNumber}: SLA has been breached!`,
          type: 'error',
          link: `/tickets/${data.id}`
        });
      });

      return () => {
        newSocket.disconnect();
      };
    }
    // STABILITY FIX: Removed `language` from deps — language changes should NOT
    // destroy and recreate the socket connection. Notification text uses the
    // latest `language` value via the `addNotification` closure.
  }, [accessToken, user?.id, user?.departmentId]);

  const addNotification = (notif: Omit<Notification, 'id' | 'createdAt' | 'read'>) => {
    const newNotif: Notification = {
      ...notif,
      id: Math.random().toString(36).substring(7),
      createdAt: new Date(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
    setToasts(prev => [...prev, newNotif]);
    
    // Auto remove toast after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newNotif.id));
    }, 5000);
    
    // Also show browser notification if permitted
    if (Notification.permission === 'granted') {
      new window.Notification(newNotif.title, { body: newNotif.message });
    }
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, toasts, markAsRead, markAllAsRead, clearNotifications, removeToast, addNotification }}>
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
