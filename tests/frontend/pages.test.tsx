// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { NotificationProvider } from '../../src/core/NotificationProvider.tsx';

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: ({ children }: any) => children,
}));

vi.mock('recharts', () => ({
  BarChart: 'div', Bar: 'div', XAxis: 'div', YAxis: 'div',
  CartesianGrid: 'div', Tooltip: 'div',
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: 'div', Pie: 'div', Cell: 'div', LineChart: 'div', Line: 'div',
  AreaChart: 'div', Area: 'div',
}));

vi.mock('../../src/store/authStore.ts', () => ({
  useAuthStore: Object.assign(
    () => ({
      user: { id: 1, fullNameAr: 'مدير', fullNameEn: 'Admin', role: 'super_admin', departmentId: null },
      accessToken: 'mock-token',
      setAuth: vi.fn(),
      logout: vi.fn(),
    }),
    { getState: () => ({ accessToken: 'mock-token', logout: vi.fn() }) },
  ),
}));

vi.mock('../../src/store/settingsStore.ts', () => ({
  useSettingsStore: () => ({
    language: 'en',
    theme: 'light',
    setLanguage: vi.fn(),
    setTheme: vi.fn(),
  }),
}));

const mockResponse = (data: any, status = 200) => {
  const r = {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    redirected: false,
    type: 'basic' as const,
    url: '',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    clone: () => r,
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
  } satisfies Partial<Response>;
  return r as unknown as Response;
};

beforeEach(() => {
  global.fetch = vi.fn();
});

function renderPage(Page: React.ComponentType) {
  return render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>
  );
}

function renderWithProvider(Page: React.ComponentType) {
  return render(
    <MemoryRouter>
      <NotificationProvider>
        <Page />
      </NotificationProvider>
    </MemoryRouter>
  );
}

describe('InboxPage', () => {
  it('renders tickets after loading', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementation((url: string) => {
      if (url.toString().includes('/api/tickets/department')) {
        return Promise.resolve(mockResponse({
          tickets: [{ id: 1, ticketNumber: 'TKT-001', subject: 'Test', status: 'open', priority: 'normal', createdAt: new Date().toISOString(), creatorName: 'User' }],
          pagination: { total: 1, page: 1, limit: 50, pages: 1 },
        }));
      }
      if (url.toString().includes('/api/admin/users')) {
        return Promise.resolve(mockResponse({ data: [] }));
      }
      return Promise.resolve(mockResponse({}));
    });

    const { default: InboxPage } = await import('../../src/pages/tickets/InboxPage.tsx');
    renderPage(InboxPage);

    await waitFor(() => {
      expect(screen.getByText('TKT-001')).toBeTruthy();
    });
  });

  it('shows error banner on fetch failure', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockRejectedValue(new Error('Network error'));

    const { default: InboxPage } = await import('../../src/pages/tickets/InboxPage.tsx');
    renderPage(InboxPage);

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeTruthy();
    });
  });
});

describe('MyTicketsPage', () => {
  it('renders my tickets after loading', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementation((url: string) => {
      if (url.toString().includes('/api/tickets/my')) {
        return Promise.resolve(mockResponse({
          tickets: [{ id: 1, ticketNumber: 'TKT-001', subject: 'My Ticket', status: 'open', priority: 'high', createdAt: new Date().toISOString(), creatorName: 'User' }],
          pagination: { total: 1, page: 1, limit: 20, pages: 1 },
        }));
      }
      return Promise.resolve(mockResponse({}));
    });

    const { default: MyTicketsPage } = await import('../../src/pages/tickets/MyTicketsPage.tsx');
    renderPage(MyTicketsPage);

    await waitFor(() => {
      expect(screen.getByText('My Ticket')).toBeTruthy();
    });
  });
});

describe('DashboardPage', () => {
  it('renders dashboard stats after loading', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementation((url: string) => {
      if (url.toString().includes('/api/analytics/dashboard-summary')) {
        return Promise.resolve(mockResponse({
          stats: { total: 100, open: 40, pending: 30, resolved: 30, overdue: 5, slaBreaches: 2, avgResolutionTimeHours: 4, resolvedInternal: 10, resolvedExternal: 20 },
          statusDistribution: [],
          priorityDistribution: [],
          departmentPerformance: [],
          agentPerformance: [],
          recentActivity: [],
          assetSummary: { total: 50, active: 40, maintenance: 5, retired: 5 },
        }));
      }
      if (url.toString().includes('/api/analytics/aht')) {
        return Promise.resolve(mockResponse({
          overallAhtHours: 3.5,
          totalResolved: 30,
          ahtByPriority: [],
          ahtByDepartment: [],
        }));
      }
      return Promise.resolve(mockResponse({}));
    });

    const { default: DashboardPage } = await import('../../src/pages/DashboardPage.tsx');
    renderPage(DashboardPage);

    await waitFor(() => {
      expect(screen.getByText(/Welcome/)).toBeTruthy();
    });
  });
});

describe('KnowledgeBasePage', () => {
  it('renders without crashing and shows categories and search', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementation((url: string) => {
      if (url.toString().includes('/api/knowledge/categories')) {
        return Promise.resolve(mockResponse([
          { id: 1, nameAr: 'تقنية', nameEn: 'IT', _count: { articles: 5 } },
        ]));
      }
      if (url.toString().includes('/api/knowledge/articles')) {
        return Promise.resolve(mockResponse({
          data: [{ id: 1, titleEn: 'How to reset password', titleAr: 'كيفية إعادة كلمة المرور', contentEn: 'Steps...', contentAr: 'خطوات...', categoryId: 1, authorId: 1, views: 0, createdAt: new Date().toISOString(), category: { nameEn: 'IT', nameAr: 'تقنية' }, author: { fullNameEn: 'Admin', fullNameAr: 'مدير' } }],
          pagination: { pages: 1 },
        }));
      }
      return Promise.resolve(mockResponse({}));
    });

    const { default: KnowledgeBasePage } = await import('../../src/pages/KnowledgeBasePage.tsx');
    renderPage(KnowledgeBasePage);

    await waitFor(() => {
      expect(screen.getByText(/All Articles/i)).toBeTruthy();
    });
  });
});

describe('AuditLogPage', () => {
  it('renders audit logs after loading', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementation((url: string) => {
      if (url.toString().includes('/api/audit/actions')) {
        return Promise.resolve(mockResponse(['TICKET_CREATED', 'TICKET_UPDATED']));
      }
      if (url.toString().includes('/api/audit')) {
        return Promise.resolve(mockResponse({
          logs: [{ id: 1, action: 'TICKET_CREATED', createdAt: new Date().toISOString(), user: { fullNameAr: 'مدير', fullNameEn: 'Admin' } }],
          pagination: { totalPages: 1 },
        }));
      }
      return Promise.resolve(mockResponse({}));
    });

    const { default: AuditLogPage } = await import('../../src/pages/AuditLogPage.tsx');
    renderPage(AuditLogPage);

    await waitFor(() => {
      expect(screen.getByText(/Audit Logs/)).toBeTruthy();
    });
  });
});

describe('AnalyticsPage', () => {
  it('renders analytics after loading', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementation((url: string) => {
      if (url.toString().includes('/api/analytics/dashboard-summary')) {
        return Promise.resolve(mockResponse({
          stats: { total: 200, open: 80, pending: 50, resolved: 70, overdue: 10, avgResolutionTimeHours: 3, resolvedInternal: 30, resolvedExternal: 40 },
          agentPerformance: [],
        }));
      }
      return Promise.resolve(mockResponse({}));
    });

    const { default: AnalyticsPage } = await import('../../src/pages/AnalyticsPage.tsx');
    renderPage(AnalyticsPage);

    await waitFor(() => {
      expect(screen.getByText(/200/)).toBeTruthy();
    });
  });
});

describe('UserManagementPage', () => {
  it('renders users after loading', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementation((url: string) => {
      if (url.toString().includes('/api/admin/users')) {
        return Promise.resolve(mockResponse({
          data: [{ id: 1, fullNameEn: 'John Doe', username: 'johnd', email: 'john@test.com', role: 'super_admin', badgeNumber: '001', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
          pagination: { total: 1, page: 1, limit: 20, pages: 1 },
        }));
      }
      return Promise.resolve(mockResponse({}));
    });

    const { default: UserManagementPage } = await import('../../src/pages/admin/UserManagementPage.tsx');
    renderPage(UserManagementPage);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeTruthy();
    });
  });
});

describe('TicketDetailsPage', () => {
  it('renders ticket detail after loading', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementation((url: string) => {
      if (url.toString().includes('/api/tickets/')) {
        return Promise.resolve(mockResponse({
          id: 1, ticketNumber: 'TKT-001', subject: 'Printer issue', description: 'Not working', status: 'open', priority: 'high',
          createdAt: new Date().toISOString(), creatorName: 'User',
          ticketType: { nameEn: 'IT', nameAr: 'تقنية', color: '#000' },
          assignedTo: null,
          messages: [],
          attachments: [],
          ticketMessage: [],
          statusHistory: [],
        }));
      }
      return Promise.resolve(mockResponse({}));
    });

    const { default: TicketDetailsPage } = await import('../../src/pages/tickets/TicketDetailsPage.tsx');
    renderWithProvider(TicketDetailsPage);

    await waitFor(() => {
      expect(screen.getByText('Printer issue')).toBeTruthy();
    });
  });
});
