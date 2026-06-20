import React, { useState, useEffect, useRef } from 'react';
import ErrorBanner from '../../components/ErrorBanner.tsx';
import { 
  Shield, 
  Plus, 
  Edit2, 
  Trash2, 
  Check,
  X,
  Lock,
  Info,
  CheckCircle2
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore.ts';
import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { motion, AnimatePresence } from 'motion/react';

interface Permission {
  id: number;
  name: string;
  description: string | null;
}

interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions: Permission[];
  _count?: { users: number };
}

export const RoleManagementPage: React.FC = () => {
  const { accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [currentRole, setCurrentRole] = useState<Partial<Role> | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMounted = useRef(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch('/api/admin/roles', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/admin/permissions', { headers: { Authorization: `Bearer ${accessToken}` } })
      ]);

      if (isMounted.current && rolesRes.ok) setRoles(await rolesRes.json());
      if (isMounted.current && permsRes.ok) setPermissions(await permsRes.json());
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      if (isMounted.current) console.error('Error fetching data:', error);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const method = currentRole?.id ? 'PUT' : 'POST';
      const url = currentRole?.id ? `/api/admin/roles/${currentRole.id}` : '/api/admin/roles';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ...currentRole,
          permissionIds: selectedPermissionIds
        })
      });

      if (res.ok) {
        setShowModal(false);
        fetchData();
      } else {
        alert('Error saving role');
      }
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error saving role:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePermission = (id: number) => {
    setSelectedPermissionIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };
  
  const handleDelete = async (id: number) => {
    if (!confirm(t.deleteRoleConfirm)) return;
    try {
      const res = await fetch(`/api/admin/roles/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.message || 'Error deleting role');
      }
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error deleting role:', error);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-3">
            <Shield className="text-primary-blue" />
            {t.rolesPermissions}
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {t.rolesPermissionsDesc}
          </p>
        </div>
        <button 
          onClick={() => {
            setCurrentRole({});
            setSelectedPermissionIds([]);
            setShowModal(true);
          }}
          className="bg-primary-blue hover:bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20"
        >
          <Plus size={20} />
          {t.addNewRole}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-[var(--bg-surface)] rounded-2xl p-6 border border-[var(--border-main)] animate-pulse">
              <div className="h-6 w-1/2 bg-[var(--bg-elevated)] rounded mb-4"></div>
              <div className="h-4 w-3/4 bg-[var(--border-dim)]/50 rounded mb-6"></div>
              <div className="space-y-2">
                <div className="h-3 w-full bg-[var(--border-dim)]/50 rounded"></div>
                <div className="h-3 w-full bg-[var(--border-dim)]/50 rounded"></div>
              </div>
            </div>
          ))
        ) : roles.map((role) => (
          <motion.div 
            key={role.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[var(--bg-surface)] rounded-2xl p-6 border border-[var(--border-main)] shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-primary-blue/10 rounded-xl text-primary-blue">
                <Shield size={24} />
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => {
                    setCurrentRole(role);
                    setSelectedPermissionIds(role.permissions.map(p => p.id));
                    setShowModal(true);
                  }}
                  className="p-2 text-[var(--text-muted)] hover:text-primary-blue hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(role.id)}
                  className="p-2 text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <h3 className="text-lg font-bold text-[var(--text-main)] mb-1">{role.name}</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6 line-clamp-2">{role.description || 'No description provided'}</p>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                <span>{t.permissions}</span>
                <span>{role.permissions.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {role.permissions.slice(0, 4).map(p => (
                  <span key={p.id} className="px-2 py-1 bg-[var(--border-dim)] text-[var(--text-secondary)] text-[10px] rounded-lg border border-[var(--border-dim)]">
                    {p.name.replace('_', ' ')}
                  </span>
                ))}
                {role.permissions.length > 4 && (
                  <span className="px-2 py-1 bg-[var(--border-dim)] text-[var(--text-muted)] text-[10px] rounded-lg">
                    +{role.permissions.length - 4} more
                  </span>
                )}
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-[var(--border-dim)] flex items-center justify-between">
              <div className="text-xs text-[var(--text-muted)]">
                {role._count?.users || 0} {t.usersAssigned.replace('{count}', (role._count?.users || 0).toString())}
              </div>
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-[var(--border-main)] bg-[var(--bg-elevated)] flex items-center justify-center text-[8px] font-bold text-[var(--text-muted)]">
                    U{i}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Role Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--bg-surface)] rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden"
            >
              <div className="p-6 border-b border-[var(--border-dim)] flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2">
                  <Shield className="text-primary-blue" />
                  {currentRole?.id ? t.editRole : t.addNewRole}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-[var(--bg-elevated)] rounded-full transition-colors">
                  <X size={24} className="text-[var(--text-muted)]" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                        {t.roleName}
                      </label>
                      <input 
                        required
                        type="text"
                        className="w-full px-4 py-2.5 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-primary-blue"
                        value={currentRole?.name || ''}
                        onChange={e => setCurrentRole({...currentRole, name: e.target.value})}
                        placeholder="e.g., IT Manager"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                        {t.description}
                      </label>
                      <textarea 
                        rows={3}
                        className="w-full px-4 py-2.5 bg-[var(--border-dim)] border-none rounded-xl focus:ring-2 focus:ring-primary-blue resize-none"
                        value={currentRole?.description || ''}
                        onChange={e => setCurrentRole({...currentRole, description: e.target.value})}
                        placeholder="What can this role do?"
                      />
                    </div>

                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                      <div className="flex gap-3">
                        <Info className="text-primary-blue flex-shrink-0" size={20} />
                        <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                          {t.permissionsInfo}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      {t.selectPermissions}
                    </label>
                    <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {permissions.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => togglePermission(p.id)}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                            selectedPermissionIds.includes(p.id)
                              ? 'bg-primary-blue/5 border-primary-blue/30 text-primary-blue'
                              : 'bg-[var(--border-dim)] border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                          }`}
                        >
                          <div className="text-left">
                            <div className="text-sm font-bold">{p.name.replace('_', ' ')}</div>
                            <div className="text-[10px] opacity-70">{p.description}</div>
                          </div>
                          {selectedPermissionIds.includes(p.id) && <CheckCircle2 size={18} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-[var(--border-dim)]">
                  <button 
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-6 py-2.5 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] rounded-xl transition-colors"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    disabled={isSubmitting}
                    className="bg-primary-blue hover:bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                  >
                    {isSubmitting ? t.saving : t.saveRole}
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

export default RoleManagementPage;
