// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: ({ children }: any) => children,
}));

vi.mock('../../src/store/authStore.ts', () => ({
  useAuthStore: Object.assign(
    () => ({
      user: { id: 1, fullNameEn: 'Admin', role: 'super_admin', departmentId: 1 },
      accessToken: 'mock-token',
    }),
    { getState: () => ({ accessToken: 'mock-token', user: { id: 1 } }) },
  ),
}));

vi.mock('../../src/store/settingsStore.ts', () => ({
  useSettingsStore: () => ({ language: 'en', theme: 'light' }),
}));

describe('NotificationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children', async () => {
    const { NotificationProvider } = await import('../../src/core/NotificationProvider.tsx');

    render(
      <MemoryRouter>
        <NotificationProvider>
          <div>child-content</div>
        </NotificationProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('child-content')).toBeTruthy();
  });

  it('provides notification context with addNotification', async () => {
    const { NotificationProvider, useNotifications } = await import('../../src/core/NotificationProvider.tsx');

    function TestChild() {
      const { notifications, unreadCount, addNotification } = useNotifications();
      return (
        <div>
          <span data-testid="count">{unreadCount}</span>
          <span data-testid="notif-count">{notifications.length}</span>
          <button onClick={() => addNotification({ title: 'Test', message: 'Hello', type: 'info' })}>
            add
          </button>
        </div>
      );
    }

    render(
      <MemoryRouter>
        <NotificationProvider>
          <TestChild />
        </NotificationProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId('count').textContent).toBe('0');

    await act(async () => {
      screen.getByText('add').click();
    });

    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('notif-count').textContent).toBe('1');
  });

  it('markAsRead updates notification read state', async () => {
    const { NotificationProvider, useNotifications } = await import('../../src/core/NotificationProvider.tsx');

    function TestChild() {
      const { notifications, unreadCount, addNotification, markAsRead } = useNotifications();
      return (
        <div>
          <span data-testid="unread">{unreadCount}</span>
          <span data-testid="read-state">{notifications[0]?.read ? 'read' : 'unread'}</span>
          <button onClick={() => addNotification({ title: 'T', message: 'M', type: 'info' })}>add</button>
          <button onClick={() => notifications[0] && markAsRead(notifications[0].id)}>mark-read</button>
        </div>
      );
    }

    render(
      <MemoryRouter>
        <NotificationProvider>
          <TestChild />
        </NotificationProvider>
      </MemoryRouter>
    );

    await act(async () => {
      screen.getByText('add').click();
    });
    expect(screen.getByTestId('unread').textContent).toBe('1');

    await act(async () => {
      screen.getByText('mark-read').click();
    });
    expect(screen.getByTestId('unread').textContent).toBe('0');
    expect(screen.getByTestId('read-state').textContent).toBe('read');
  });

  it('markAllAsRead clears unread count', async () => {
    const { NotificationProvider, useNotifications } = await import('../../src/core/NotificationProvider.tsx');

    function TestChild() {
      const { unreadCount, addNotification, markAllAsRead } = useNotifications();
      return (
        <div>
          <span data-testid="unread">{unreadCount}</span>
          <button onClick={() => { addNotification({ title: 'A', message: 'B', type: 'info' }); addNotification({ title: 'C', message: 'D', type: 'warning' }); }}>add-two</button>
          <button onClick={markAllAsRead}>mark-all</button>
        </div>
      );
    }

    render(
      <MemoryRouter>
        <NotificationProvider>
          <TestChild />
        </NotificationProvider>
      </MemoryRouter>
    );

    await act(async () => {
      screen.getByText('add-two').click();
    });
    expect(screen.getByTestId('unread').textContent).toBe('2');

    await act(async () => {
      screen.getByText('mark-all').click();
    });
    expect(screen.getByTestId('unread').textContent).toBe('0');
  });

  it('clearNotifications empties the list', async () => {
    const { NotificationProvider, useNotifications } = await import('../../src/core/NotificationProvider.tsx');

    function TestChild() {
      const { notifications, addNotification, clearNotifications } = useNotifications();
      return (
        <div>
          <span data-testid="count">{notifications.length}</span>
          <button onClick={() => addNotification({ title: 'X', message: 'Y', type: 'error' })}>add</button>
          <button onClick={clearNotifications}>clear</button>
        </div>
      );
    }

    render(
      <MemoryRouter>
        <NotificationProvider>
          <TestChild />
        </NotificationProvider>
      </MemoryRouter>
    );

    await act(async () => {
      screen.getByText('add').click();
    });
    expect(screen.getByTestId('count').textContent).toBe('1');

    await act(async () => {
      screen.getByText('clear').click();
    });
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('throws when useNotifications used outside provider', async () => {
    const { useNotifications } = await import('../../src/core/NotificationProvider.tsx');

    function BadChild() {
      useNotifications();
      return <div />;
    }

    expect(() => {
      render(
        <MemoryRouter>
          <BadChild />
        </MemoryRouter>
      );
    }).toThrow('useNotifications must be used within a NotificationProvider');
  });
});
