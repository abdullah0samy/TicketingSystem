import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from './store/authStore.ts';
import { useSettingsStore } from './store/settingsStore.ts';
import { translations } from './core/translations.ts';
import Login from './pages/Login.tsx';
import BuildingsPage from './pages/admin/BuildingsPage.tsx';
import FloorsPage from './pages/admin/FloorsPage.tsx';
import DepartmentsPage from './pages/admin/DepartmentsPage.tsx';
import TicketTypesPage from './pages/admin/TicketTypesPage.tsx';
import UserManagementPage from './pages/admin/UserManagementPage.tsx';
import RoleManagementPage from './pages/admin/RoleManagementPage.tsx';
import UserProfilePage from './pages/UserProfilePage.tsx';
import AnalyticsPage from './pages/AnalyticsPage.tsx';
import AssetManagementPage from './pages/admin/AssetManagementPage.tsx';
import KnowledgeBasePage from './pages/KnowledgeBasePage.tsx';
import NewTicketPage from './pages/tickets/NewTicketPage.tsx';
import InboxPage from './pages/tickets/InboxPage.tsx';
import MyTicketsPage from './pages/tickets/MyTicketsPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import TicketDetailsPage from './pages/tickets/TicketDetailsPage.tsx';
import TeamFeedPage from './pages/TeamFeedPage.tsx';
import AuditLogPage from './pages/AuditLogPage.tsx';
import TransferredPage from './pages/tickets/TransferredPage.tsx';
import ArchivePage from './pages/tickets/ArchivePage.tsx';
import { NotificationProvider, useNotifications } from './core/NotificationProvider.tsx';
import { GlobalSearch } from './components/GlobalSearch.tsx';
import {
  LayoutDashboard,
  PlusCircle,
  Inbox,
  Send,
  RefreshCw,
  Archive,
  BarChart3,
  Settings,
  Bell,
  User,
  LogOut,
  LifeBuoy,
  Activity,
  Sun,
  Moon,
  Globe,
  Building2,
  Layers,
  Users,
  ChevronRight,
  Tag,
  AlertTriangle,
  AlertCircle,
  X,
  UserCog,
  ShieldCheck,
  ShieldAlert,
  BookOpen,
  Package,
  Menu,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}

function AppContent() {
  const { user, accessToken, logout, setAuth } = useAuthStore();
  const { language, theme, toggleLanguage, toggleTheme } = useSettingsStore();
  const { notifications, unreadCount, toasts, removeToast, markAsRead, markAllAsRead } = useNotifications();
  const [currentPath, setCurrentPath] = useState('/dashboard');
  const [showNotifications, setShowNotifications] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = translations[language];

  const navigate = useCallback((path: string) => {
    setCurrentPath(path);
    setSidebarOpen(false);
    setShowNotifications(false);
  }, []);

  useEffect(() => {
    const handleNavigate = (e: any) => {
      setCurrentPath(e.detail);
      setSidebarOpen(false);
      setShowNotifications(false);
    };
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (accessToken && !user && !isFetching) {
      setIsFetching(true);
      fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        signal: controller.signal
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Session expired');
      })
      .then(userData => {
        if (!cancelled) setAuth(userData, accessToken);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!cancelled) logout();
      })
      .finally(() => {
        if (!cancelled) {
          setIsReady(true);
          setIsFetching(false);
        }
      });
    } else if (!accessToken || user) {
      setIsReady(true);
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setSidebarOpen(true);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isReady) return <div className="min-h-screen flex items-center justify-center bg-[var(--bg-main)] text-[var(--text-muted)] font-sans text-lg font-semibold">Loading...</div>;
  if (!user) return <Login />;

  const allSidebarItems = [
    { icon: LayoutDashboard, label: t.dashboard, path: '/dashboard', roles: ['super_admin', 'supervisor', 'agent', 'end_user'] },
    { icon: PlusCircle, label: t.newTicket, path: '/tickets/new', roles: ['super_admin', 'supervisor', 'agent', 'end_user'] },
    { icon: Inbox, label: t.incoming, path: '/inbox', roles: ['super_admin', 'supervisor', 'agent'] },
    { icon: Send, label: t.outgoing, path: '/my-tickets', roles: ['super_admin', 'supervisor', 'agent', 'end_user'] },
    { icon: RefreshCw, label: t.transferred, path: '/transferred', roles: ['super_admin', 'supervisor', 'agent'] },
    { icon: Archive, label: t.archive, path: '/archive', roles: ['super_admin', 'supervisor', 'agent'] },
    { icon: BarChart3, label: t.analytics, path: '/analytics', roles: ['super_admin', 'supervisor', 'agent'] },
    { icon: Users, label: language === 'ar' ? 'ساحة الفريق' : 'Team Feed', path: '/team-feed', roles: ['super_admin', 'supervisor', 'agent'] },
    { icon: BookOpen, label: language === 'ar' ? 'المركز المعرفي' : 'Knowledge Base', path: '/knowledge', roles: ['super_admin', 'supervisor', 'agent', 'end_user'] },
    { icon: User, label: language === 'ar' ? 'الملف الشخصي' : 'Profile', path: '/profile', roles: ['super_admin', 'supervisor', 'agent', 'end_user'] },
  ];
  const sidebarItems = allSidebarItems.filter(item => item.roles.includes(user.role));

  const adminItems = [
    { icon: Building2, label: language === 'ar' ? 'المباني' : 'Buildings', path: '/admin/buildings' },
    { icon: Layers, label: language === 'ar' ? 'الطوابق' : 'Floors', path: '/admin/floors' },
    { icon: Users, label: language === 'ar' ? 'الأقسام' : 'Departments', path: '/admin/departments' },
    { icon: Tag, label: language === 'ar' ? 'أنواع التذاكر' : 'Ticket Types', path: '/admin/ticket-types' },
    { icon: UserCog, label: language === 'ar' ? 'إدارة المستخدمين' : 'Users', path: '/admin/users' },
    { icon: ShieldCheck, label: language === 'ar' ? 'الأدوار' : 'Roles', path: '/admin/roles' },
    { icon: Package, label: language === 'ar' ? 'الأصول' : 'Assets', path: '/admin/assets' },
    { icon: ShieldAlert, label: language === 'ar' ? 'سجلات التدقيق' : 'Audit Logs', path: '/admin/audit' },
  ];

  const renderContent = () => {
    const adminPaths = ['/admin/buildings', '/admin/floors', '/admin/departments', '/admin/ticket-types', '/admin/users', '/admin/roles', '/admin/assets', '/admin/audit'];
    const cleanPath = currentPath.split('?')[0];
    if (adminPaths.includes(cleanPath) && user.role !== 'super_admin') return <DashboardPage />;

    if (currentPath.startsWith('/tickets/')) {
      const pathParts = currentPath.split('?')[0].split('/');
      const idPart = pathParts[2];
      const id = parseInt(idPart);

      if (idPart === 'new') return <NewTicketPage />;
      if (!isNaN(id)) return <TicketDetailsPage ticketId={id} />;
    }

    switch (cleanPath) {
      case '/dashboard': return <DashboardPage />;
      case '/admin/buildings': return <BuildingsPage />;
      case '/admin/floors': return <FloorsPage />;
      case '/admin/departments': return <DepartmentsPage />;
      case '/admin/ticket-types': return <TicketTypesPage />;
      case '/admin/users': return <UserManagementPage />;
      case '/admin/roles': return <RoleManagementPage />;
      case '/admin/assets': return <AssetManagementPage />;
      case '/profile': return <UserProfilePage />;
      case '/analytics': return <AnalyticsPage />;
      case '/knowledge': return <KnowledgeBasePage />;
      case '/team-feed': return <TeamFeedPage />;
      case '/admin/audit': return <AuditLogPage />;
      case '/inbox': return <InboxPage />;
      case '/my-tickets': return <MyTicketsPage />;
      case '/transferred': return <TransferredPage />;
      case '/archive': return <ArchivePage />;
      default: return <DashboardPage />;
    }
  };

  const sidebar = (
    <aside className={`h-full bg-[var(--bg-surface)] border-r border-[var(--border-main)] flex flex-col transition-colors duration-300`}>
      <div className="p-5 flex items-center gap-3 border-b border-[var(--border-dim)]">
        <div className="w-9 h-9 flex items-center justify-center shrink-0">
          <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="text-base font-extrabold text-[var(--text-main)] leading-tight">{t.appName}</h1>
          <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{t.appSubName}</p>
        </div>
      </div>

      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest px-3 mb-2">
          {language === 'ar' ? 'القائمة الرئيسية' : 'Main Menu'}
        </p>
        {sidebarItems.map((item, idx) => (
          <button
            key={idx}
            onClick={() => navigate(item.path)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
              currentPath === item.path
                ? 'bg-primary-blue text-white shadow-md shadow-primary-blue/20'
                : 'text-[var(--text-secondary)] hover:bg-[var(--border-dim)] hover:text-[var(--text-main)]'
            }`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}

        {user.role === 'super_admin' && (
          <div className="mt-6">
            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest px-3 mb-2">
              {language === 'ar' ? 'الإدارة' : 'Management'}
            </p>
            {adminItems.map((item, idx) => (
              <button
                key={idx}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
                  currentPath === item.path
                    ? 'bg-primary-blue text-white shadow-md shadow-primary-blue/20'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--border-dim)] hover:text-[var(--text-main)]'
                }`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="p-3 border-t border-[var(--border-dim)]">
        <button
          onClick={() => { logout(); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[var(--color-danger-red)] hover:bg-danger-red/10 transition-all text-sm font-medium"
        >
          <LogOut size={18} />
          <span>{t.signOut}</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className={`flex h-screen bg-[var(--bg-main)] font-sans overflow-hidden ${language === 'ar' ? 'rtl' : 'ltr'}`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sidebar-overlay lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop */}
      <div className="hidden lg:flex w-64 shrink-0">
        {sidebar}
      </div>

      {/* Sidebar - Mobile */}
      <div className={`lg:hidden fixed inset-0 z-50 pointer-events-none ${sidebarOpen ? '' : ''}`}>
        <div className={`sidebar-mobile ${language === 'ar' ? 'rtl' : ''} ${sidebarOpen ? '' : 'closed'} pointer-events-auto`}>
          {sidebar}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 lg:h-16 bg-[var(--bg-surface)] border-b border-[var(--border-main)] px-3 sm:px-4 lg:px-6 flex items-center justify-between z-10 transition-colors shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-all rounded-lg hover:bg-[var(--border-dim)]"
            >
              <Menu size={20} />
            </button>
            <div className="flex-1 min-w-0 max-w-md">
              <GlobalSearch />
            </div>

            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-all rounded-lg hover:bg-[var(--border-dim)]"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-[var(--color-danger-red)] text-white text-[9px] flex items-center justify-center rounded-full border-2 border-[var(--bg-surface)] font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className={`absolute top-12 ${language === 'ar' ? 'right-0' : 'left-0'} w-80 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] shadow-2xl z-50 overflow-hidden`}>
                  <div className="p-3 border-b border-[var(--border-dim)] flex items-center justify-between">
                    <h3 className="font-bold text-sm text-[var(--text-main)]">{language === 'ar' ? 'التنبيهات' : 'Notifications'}</h3>
                    <button
                      onClick={markAllAsRead}
                      className="text-[10px] font-bold text-primary-blue uppercase tracking-widest hover:underline"
                    >
                      {language === 'ar' ? 'تحديد الكل كمقروء' : 'Mark all as read'}
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            markAsRead(n.id);
                            if (n.link) {
                              navigate(n.link);
                            }
                          }}
                          className={`p-3 border-b border-[var(--border-dim)] hover:bg-[var(--border-dim)] cursor-pointer transition-all ${!n.read ? 'bg-primary-blue/[0.04]' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.read ? 'bg-primary-blue' : 'bg-transparent'}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-[var(--text-main)] truncate">{n.title}</p>
                              <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">{n.message}</p>
                              <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{new Date(n.createdAt).toLocaleTimeString()}</p>

                              {n.status === 'resolved' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(n.id);
                                    window.dispatchEvent(new CustomEvent('navigate', { detail: `/tickets/${n.ticketId}?confirm=true` }));
                                    setShowNotifications(false);
                                  }}
                                  className="mt-2 w-full py-1.5 bg-[var(--color-success-green)] text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:opacity-90 transition-all"
                                >
                                  {t.confirmResolution}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-[var(--text-muted)] text-sm">
                        {language === 'ar' ? 'لا توجد تنبيهات' : 'No notifications'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-2 border-l border-[var(--border-main)] pl-2 sm:pl-4">
              <button
                onClick={toggleTheme}
                className="p-2 text-[var(--text-secondary)] hover:text-primary-blue transition-all rounded-lg hover:bg-[var(--border-dim)]"
                title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <button
                onClick={toggleLanguage}
                className="p-2 text-[var(--text-secondary)] hover:text-primary-blue transition-all rounded-lg hover:bg-[var(--border-dim)] flex items-center gap-1"
                title={language === 'ar' ? 'English' : 'العربية'}
              >
                <Globe size={18} />
                <span className="text-[10px] font-bold uppercase hidden sm:inline">{language}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 ml-2 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-[var(--text-main)] leading-tight">{language === 'ar' ? user.fullNameAr : user.fullNameEn}</p>
              <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{user.role.replace('_', ' ')}</p>
            </div>
            <div className="w-9 h-9 bg-[var(--border-dim)] rounded-full flex items-center justify-center border-2 border-[var(--border-dim)] overflow-hidden shrink-0">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="text-primary-blue" size={16} />
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 xl:p-8 bg-[var(--bg-main)]">
          {renderContent()}
        </div>
      </main>

      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className="pointer-events-auto bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-2xl p-3 sm:p-4 shadow-2xl flex items-start gap-3 min-w-[280px] max-w-sm cursor-pointer"
              onClick={() => {
                if (toast.link) navigate(toast.link);
                removeToast(toast.id);
              }}
            >
              <div className={`p-2 rounded-xl shrink-0 ${
                toast.type === 'warning' ? 'bg-warning-amber/10 text-warning-amber' :
                toast.type === 'error' ? 'bg-danger-red/10 text-danger-red' :
                'bg-primary-blue/10 text-primary-blue'
              }`}>
                {toast.type === 'warning' ? <AlertTriangle size={18} /> :
                 toast.type === 'error' ? <AlertCircle size={18} /> :
                 <Bell size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-[var(--text-main)] truncate">{toast.title}</h4>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">{toast.message}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all shrink-0"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
