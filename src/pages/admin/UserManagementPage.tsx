import React, { useState, useEffect } from 'react';
import ErrorBanner from '../../components/ErrorBanner.tsx';
import { 
  Users, 
  UserPlus, 
  Edit2, 
  Trash2, 
  Key, 
  Search, 
  Filter,
  CheckCircle2,
  XCircle,
  Shield,
  Building2
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore.ts';
import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { motion, AnimatePresence } from 'motion/react';

interface User {
  id: number;
  badgeNumber: string;
  username: string;
  email: string | null;
  fullNameAr: string;
  fullNameEn: string | null;
  role: string;
  roleId: number | null;
  isActive: boolean;
  departmentId: number | null;
  department?: { nameEn: string; nameAr: string };
  userRole?: { name: string };
  permissionsOverride?: {
    canArchiveTickets: boolean | null;
    canExportData: boolean | null;
    canViewAnalytics: boolean | null;
    canManageTeamNotes: boolean | null;
    canManageDeptUsers: boolean | null;
    canViewAuditLogs: boolean | null;
    canManageKnowledgeBase: boolean | null;
  };
}

interface Role {
  id: number;
  name: string;
}

interface Department {
  id: number;
  nameEn: string;
  nameAr: string;
}

export const UserManagementPage: React.FC = () => {
  const { accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<Partial<User> | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'permissions'>('info');
  const [error, setError] = useState<string | null>(null);

  const permissionKeys = [
    { key: 'canArchiveTickets', labelAr: 'أرشفة التذاكر', labelEn: 'Archive Tickets' },
    { key: 'canExportData', labelAr: 'تصدير البيانات', labelEn: 'Export Data' },
    { key: 'canViewAnalytics', labelAr: 'عرض التحليلات', labelEn: 'View Analytics' },
    { key: 'canManageTeamNotes', labelAr: 'إدارة ملاحظات الفريق', labelEn: 'Manage Team Notes' },
    { key: 'canManageDeptUsers', labelAr: 'إدارة مستخدمي القسم', labelEn: 'Manage Dept Users' },
    { key: 'canViewAuditLogs', labelAr: 'عرض سجل التدقيق', labelEn: 'View Audit Logs' },
    { key: 'canManageKnowledgeBase', labelAr: 'إدارة المركز المعرفي', labelEn: 'Manage Knowledge Base' },
  ];

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, []);

  const fetchData = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, deptsRes] = await Promise.all([
        fetch('/api/admin/users', { headers: { Authorization: `Bearer ${accessToken}` }, signal }),
        fetch('/api/admin/roles', { headers: { Authorization: `Bearer ${accessToken}` }, signal }),
        fetch('/api/admin/departments', { headers: { Authorization: `Bearer ${accessToken}` }, signal })
      ]);

      if (usersRes.ok) {
        const json = await usersRes.json();
        setUsers(Array.isArray(json) ? json : json.data);
      }
      if (rolesRes.ok) setRoles(await rolesRes.json());
      if (deptsRes.ok) setDepartments(await deptsRes.json());
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      setError(error?.message || 'Something went wrong');
      console.error('Error fetching data:', error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const method = currentUser?.id ? 'PUT' : 'POST';
      const url = currentUser?.id ? `/api/admin/users/${currentUser.id}` : '/api/admin/users';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(currentUser)
      });

      if (res.ok) {
        setShowModal(false);
        fetchData();
      } else {
        const data = await res.json();
        alert(data.message || 'Error saving user');
      }
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error saving user:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id || !newPassword) return;
    
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${currentUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ password: newPassword, forcePasswordChange: true })
      });

      if (res.ok) {
        setShowResetModal(false);
        setNewPassword('');
        alert('Password reset successfully');
      } else {
        alert('Error resetting password');
      }
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error resetting password:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleUserStatus = async (user: User) => {
    if (!confirm(language === 'ar' ? `هل أنت متأكد من ${user.isActive ? 'إلغاء تنشيط' : 'تنشيط'} هذا المستخدم؟` : `Are you sure you want to ${user.isActive ? 'deactivate' : 'activate'} this user?`)) return;
    
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ isActive: !user.isActive })
      });

      if (res.ok) fetchData();
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error toggling status:', error);
    }
  };

  const filteredUsers = users.filter(u => 
    u.fullNameEn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.fullNameAr.includes(searchTerm) ||
    u.badgeNumber.includes(searchTerm) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-3">
            <Users className="text-primary-blue" />
            {t.userManagement}
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {t.userManagementDesc}
          </p>
        </div>
        <button 
          onClick={() => {
            setCurrentUser({ role: 'end_user', isActive: true });
            setShowModal(true);
          }}
          className="bg-primary-blue hover:bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20"
        >
          <UserPlus size={20} />
          {t.addUser}
        </button>
      </div>

      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[var(--border-dim)] flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
            <input 
              type="text"
              placeholder={t.searchByNameOrId}
              className="w-full pl-10 pr-4 py-2 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-primary-blue text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors">
            <Filter size={20} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--border-dim)]/50 text-[var(--text-secondary)] text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">{t.userLabel}</th>
                <th className="px-6 py-4 font-semibold">{t.fingerId}</th>
                <th className="px-6 py-4 font-semibold">{t.role}</th>
                <th className="px-6 py-4 font-semibold">{t.department}</th>
                <th className="px-6 py-4 font-semibold">{t.status}</th>
                <th className="px-6 py-4 font-semibold text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-dim)]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[var(--text-muted)]">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-primary-blue border-t-transparent rounded-full animate-spin"></div>
                      <span>{t.loadingUsers}</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[var(--text-muted)]">
                    {t.noUsersFound}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-[var(--border-dim)]/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-primary-blue font-bold">
                          {user.fullNameEn ? user.fullNameEn.charAt(0) : user.fullNameAr.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-[var(--text-main)]">
                            {language === 'ar' ? user.fullNameAr : (user.fullNameEn || user.fullNameAr)}
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)] font-mono">
                      {user.badgeNumber}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                        user.role === 'super_admin' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                        user.role === 'supervisor' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                        user.role === 'agent' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                        'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                      }`}>
                        {user.userRole?.name || user.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <Building2 size={14} className="text-[var(--text-muted)]" />
                        {user.department ? (language === 'ar' ? user.department.nameAr : user.department.nameEn) : '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => toggleUserStatus(user)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold transition-all ${
                          user.isActive 
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' 
                            : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                        }`}
                      >
                        {user.isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {user.isActive ? t.active : t.disabled}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            setCurrentUser(user);
                            setShowModal(true);
                          }}
                          className="p-2 text-[var(--text-muted)] hover:text-primary-blue hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                          title={t.edit}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => {
                            setCurrentUser(user);
                            setShowResetModal(true);
                          }}
                          className="p-2 text-[var(--text-muted)] hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all"
                          title={t.resetPassword}
                        >
                          <Key size={16} />
                        </button>
                        <button 
                          className="p-2 text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                          title={t.deleteAction}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[var(--bg-surface)] rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-[var(--border-dim)] flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2">
                  {currentUser?.id ? <Edit2 className="text-primary-blue" /> : <UserPlus className="text-primary-blue" />}
                  {currentUser?.id 
                    ? t.editUser 
                    : t.addNewUser}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-[var(--bg-elevated)] rounded-full transition-colors">
                  <XCircle size={24} className="text-[var(--text-muted)]" />
                </button>
              </div>

              <div className="flex border-b border-[var(--border-dim)]">
                <button 
                  onClick={() => setActiveTab('info')}
                  className={`px-8 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'info' ? 'border-primary-blue text-primary-blue' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                >
                  {t.basicInfo}
                </button>
                <button 
                  onClick={() => setActiveTab('permissions')}
                  className={`px-8 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'permissions' ? 'border-primary-blue text-primary-blue' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                >
                  {t.permissionsOverrides}
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6">
                <div className="overflow-y-auto max-h-[60vh] px-2">
                  {activeTab === 'info' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{t.fingerIdStaffId}</label>
                        <input required type="text" placeholder="00000" className="w-full px-4 py-2.5 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-primary-blue" value={currentUser?.badgeNumber || ''} onChange={e => setCurrentUser({...currentUser, badgeNumber: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{t.numericLoginId}</label>
                        <input required type="text" placeholder="00000" className="w-full px-4 py-2.5 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-primary-blue" value={currentUser?.username || ''} onChange={e => setCurrentUser({...currentUser, username: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{t.fullNameArabic}</label>
                        <input required type="text" className="w-full px-4 py-2.5 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-primary-blue" value={currentUser?.fullNameAr || ''} onChange={e => setCurrentUser({...currentUser, fullNameAr: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{t.fullNameEnglish}</label>
                        <input type="text" className="w-full px-4 py-2.5 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-primary-blue" value={currentUser?.fullNameEn || ''} onChange={e => setCurrentUser({...currentUser, fullNameEn: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{t.emailLabel}</label>
                        <input type="email" className="w-full px-4 py-2.5 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-primary-blue" value={currentUser?.email || ''} onChange={e => setCurrentUser({...currentUser, email: e.target.value})} />
                      </div>
                      {!currentUser?.id && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{t.password}</label>
                          <input required type="password" className="w-full px-4 py-2.5 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-primary-blue" onChange={e => setCurrentUser({...currentUser, password: e.target.value} as any)} />
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{t.role}</label>
                        <select className="w-full px-4 py-2.5 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-primary-blue" value={currentUser?.roleId || currentUser?.role || ''} onChange={e => {
                          const val = e.target.value;
                          if (!isNaN(parseInt(val))) {
                            setCurrentUser({...currentUser, roleId: parseInt(val), role: roles.find(r => r.id === parseInt(val))?.name.toLowerCase().replace(' ', '_') || 'end_user'});
                          } else {
                            setCurrentUser({...currentUser, role: val, roleId: null});
                          }
                        }}>
                          <optgroup label="System Roles">
                            <option value="end_user">End User</option>
                            <option value="agent">Agent</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="super_admin">Super Admin</option>
                          </optgroup>
                          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{t.department}</label>
                        <select className="w-full px-4 py-2.5 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-primary-blue" value={currentUser?.departmentId || ''} onChange={e => setCurrentUser({...currentUser, departmentId: e.target.value ? parseInt(e.target.value) : null})}>
                          <option value="">{t.noDepartment}</option>
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{language === 'ar' ? d.nameAr : d.nameEn}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" className="w-5 h-5 rounded-lg border-[var(--border-main)] text-primary-blue focus:ring-primary-blue" checked={currentUser?.isActive} onChange={e => setCurrentUser({...currentUser, isActive: e.target.checked})} />
                          <span className="text-sm font-medium text-[var(--text-secondary)]">{t.accountActive}</span>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 pb-6 pt-2">
                      <div className="p-4 bg-primary-blue/5 rounded-2xl border border-primary-blue/10">
                        <p className="text-xs text-primary-blue font-medium leading-relaxed">
                          {t.permissionsOverrideDesc}
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {permissionKeys.map(p => {
                          const currentValue = currentUser?.permissionsOverride?.[p.key as keyof typeof currentUser.permissionsOverride];
                          return (
                            <div key={p.key} className="flex flex-col gap-2 p-3 rounded-2xl border border-[var(--border-dim)] hover:bg-[var(--border-dim)]/30 transition-all">
                              <label className="text-xs font-bold text-[var(--text-secondary)]">
                                {language === 'ar' ? p.labelAr : p.labelEn}
                              </label>
                              <div className="flex bg-[var(--bg-elevated)] p-1 rounded-xl">
                                <button 
                                  type="button"
                                  onClick={() => setCurrentUser({
                                    ...currentUser, 
                                    permissionsOverride: { ...currentUser?.permissionsOverride as any, [p.key]: true } 
                                  })}
                                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${currentValue === true ? 'bg-success-green text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                                >
                                  {t.allow}
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => setCurrentUser({
                                    ...currentUser, 
                                    permissionsOverride: { ...currentUser?.permissionsOverride as any, [p.key]: false } 
                                  })}
                                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${currentValue === false ? 'bg-danger-red text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                                >
                                  {t.deny}
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => {
                                    const newOverride = { ...currentUser?.permissionsOverride as any };
                                    delete newOverride[p.key];
                                    setCurrentUser({ ...currentUser, permissionsOverride: newOverride });
                                  }}
                                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${currentValue === undefined || currentValue === null ? 'bg-[var(--bg-surface)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-slate-200'}`}
                                >
                                  {t.defaultPermission}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-[var(--border-dim)] bg-[var(--bg-surface)]">
                  <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] rounded-xl transition-colors">{t.cancel}</button>
                  <button disabled={isSubmitting} className="bg-primary-blue hover:bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50">
                    {isSubmitting ? t.saving : t.saveUser}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Password Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--bg-surface)] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-[var(--border-dim)] flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2">
                  <Key className="text-amber-500" />
                  {t.resetPassword}
                </h2>
                <button onClick={() => setShowResetModal(false)} className="p-2 hover:bg-[var(--bg-elevated)] rounded-full transition-colors">
                  <XCircle size={24} className="text-[var(--text-muted)]" />
                </button>
              </div>

              <form onSubmit={handleResetPassword} className="p-6 space-y-4">
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    {t.resettingPasswordFor.replace('{name}', language === 'ar' ? currentUser?.fullNameAr : (currentUser?.fullNameEn || currentUser?.fullNameAr))}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    {t.newPassword}
                  </label>
                  <input 
                    required
                    type="password"
                    className="w-full px-4 py-2.5 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-amber-500"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  <button 
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    className="px-6 py-2.5 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] rounded-xl transition-colors"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    disabled={isSubmitting}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-8 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                  >
                    {isSubmitting ? t.resetting : t.confirmReset}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserManagementPage;
