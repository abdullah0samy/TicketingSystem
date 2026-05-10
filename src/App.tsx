import { useEffect, useState } from 'react';
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
  Package
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
  const t = translations[language];

  useEffect(() => {
    // Handle custom navigation events
    const handleNavigate = (e: any) => {
      setCurrentPath(e.detail);
    };
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  useEffect(() => {
    // Apply theme to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    // Check if user is already logged in via token
    if (accessToken && !user && !isFetching) {
      setIsFetching(true);
      fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include'
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Session expired');
      })
      .then(userData => {
        setAuth(userData, accessToken);
      })
      .catch(() => logout())
      .finally(() => {
        setIsReady(true);
        setIsFetching(false);
      });
    } else if (!accessToken || user) {
      setIsReady(true);
    }
    // STABILITY FIX: Removed setAuth, logout (stable zustand refs) and isFetching
    // (guarded internally) from deps to prevent request flood loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user]);

  if (!isReady) return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">Loading...</div>;
  if (!user) return <Login />;

  const sidebarItems = [
    { icon: LayoutDashboard, label: t.dashboard, path: '/dashboard' },
    { icon: PlusCircle, label: t.newTicket, path: '/tickets/new' },
    { icon: Inbox, label: t.incoming, path: '/inbox' },
    { icon: Send, label: t.outgoing, path: '/my-tickets' },
    { icon: RefreshCw, label: t.transferred, path: '/transferred' },
    { icon: Archive, label: t.archive, path: '/archive' },
    { icon: BarChart3, label: t.analytics, path: '/analytics' },
    { icon: Users, label: language === 'ar' ? 'ساحة الفريق' : 'Team Feed', path: '/team-feed' },
    { icon: BookOpen, label: language === 'ar' ? 'المركز المعرفي' : 'Knowledge Base', path: '/knowledge' },
    { icon: User, label: language === 'ar' ? 'الملف الشخصي' : 'Profile', path: '/profile' },
  ];

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
    // Handle ticket details route with potential query params
    if (currentPath.startsWith('/tickets/')) {
      const pathParts = currentPath.split('?')[0].split('/');
      const idPart = pathParts[2];
      const id = parseInt(idPart);
      
      if (idPart === 'new') return <NewTicketPage />;
      if (!isNaN(id)) return <TicketDetailsPage ticketId={id} />;
    }

    switch (currentPath.split('?')[0]) {
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

  return (
    <div className={`flex h-screen bg-slate-50 dark:bg-slate-950 font-sans overflow-hidden ${language === 'ar' ? 'rtl' : 'ltr'}`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-sidebar-bg border-r border-slate-200 dark:border-slate-800 flex flex-col transition-colors duration-300">
        <div className="p-6 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight">{t.appName}</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.appSubName}</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-4 mb-2">
            {language === 'ar' ? 'القائمة الرئيسية' : 'Main Menu'}
          </div>
          {sidebarItems.map((item, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentPath(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                currentPath === item.path 
                  ? 'bg-primary-blue text-white shadow-lg shadow-primary-blue/20' 
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary-blue dark:hover:text-white'
              }`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}

          {user.role === 'super_admin' && (
            <div className="mt-8">
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-4 mb-2">
                {language === 'ar' ? 'الإدارة' : 'Management'}
              </div>
              {adminItems.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentPath(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                    currentPath === item.path 
                      ? 'bg-primary-blue text-white shadow-lg shadow-primary-blue/20' 
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary-blue dark:hover:text-white'
                  }`}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-danger-red hover:bg-danger-red/10 transition-all font-medium"
          >
            <LogOut size={20} />
            <span>{t.signOut}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 flex items-center justify-between z-10 transition-colors">
          <div className="flex items-center gap-6 flex-1">
            <GlobalSearch />
            
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all"
              >
                <Bell size={22} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-danger-red text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute top-12 left-0 w-80 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white">{language === 'ar' ? 'التنبيهات' : 'Notifications'}</h3>
                    <button 
                      onClick={markAllAsRead}
                      className="text-[10px] font-bold text-primary-blue uppercase tracking-widest hover:underline"
                    >
                      {language === 'ar' ? 'تحديد الكل كمقروء' : 'Mark all as read'}
                    </button>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.map((n) => (
                        <div 
                          key={n.id} 
                          onClick={() => {
                            markAsRead(n.id);
                            if (n.link) {
                              setCurrentPath(n.link);
                              setShowNotifications(false);
                            }
                          }}
                          className={`p-4 border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-all ${!n.read ? 'bg-primary-blue/5' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.read ? 'bg-primary-blue' : 'bg-transparent'}`} />
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">{n.title}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{n.message}</p>
                              <p className="text-[10px] text-slate-400 mt-2">{new Date(n.createdAt).toLocaleTimeString()}</p>
                              
                              {n.status === 'resolved' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(n.id);
                                    window.dispatchEvent(new CustomEvent('navigate', { detail: `/tickets/${n.ticketId}?confirm=true` }));
                                    setShowNotifications(false);
                                  }}
                                  className="mt-3 w-full py-2 bg-success-green text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-green-600 transition-all"
                                >
                                  {t.confirmResolution}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-sm">
                        {language === 'ar' ? 'لا توجد تنبيهات' : 'No notifications'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 border-l dark:border-slate-800 pl-6">
              <button 
                onClick={toggleTheme}
                className="p-2 text-slate-400 hover:text-primary-blue transition-all"
              >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </button>
              <button 
                onClick={toggleLanguage}
                className="p-2 text-slate-400 hover:text-primary-blue transition-all flex items-center gap-1"
              >
                <Globe size={20} />
                <span className="text-xs font-bold uppercase">{language}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{language === 'ar' ? user.fullNameAr : user.fullNameEn}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{user.role.replace('_', ' ')} • {language === 'ar' ? user.department?.nameAr : user.department?.nameEn}</p>
            </div>
            <div className="w-10 h-10 bg-blue-50 dark:bg-slate-800 rounded-full flex items-center justify-center border border-blue-100 dark:border-slate-700 overflow-hidden">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="text-primary-blue" size={20} />
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 dark:bg-slate-950/50">
          {renderContent()}
        </div>
      </main>
      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className="pointer-events-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xl flex items-start gap-4 min-w-[300px] max-w-md cursor-pointer"
              onClick={() => {
                if (toast.link) setCurrentPath(toast.link);
                removeToast(toast.id);
              }}
            >
              <div className={`p-2 rounded-xl flex-shrink-0 ${
                toast.type === 'warning' ? 'bg-warning-amber/10 text-warning-amber' :
                toast.type === 'error' ? 'bg-danger-red/10 text-danger-red' :
                'bg-primary-blue/10 text-primary-blue'
              }`}>
                {toast.type === 'warning' ? <AlertTriangle size={20} /> :
                 toast.type === 'error' ? <AlertCircle size={20} /> :
                 <Bell size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{toast.title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{toast.message}</p>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                className="text-slate-300 hover:text-slate-500 transition-all"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
