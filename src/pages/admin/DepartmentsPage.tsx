import React, { useState, useEffect, useRef } from 'react';
import ErrorBanner from '../../components/ErrorBanner.tsx';
import { useAuthStore } from '../../store/authStore.ts';
import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { Users, Plus, Edit2, Trash2, X, Shield } from 'lucide-react';
import { motion } from 'motion/react';

interface Department {
  id: number;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  deptType: string;
  isActive: boolean;
  _count?: { users: number };
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [formData, setFormData] = useState({ 
    nameAr: '', 
    nameEn: '', 
    descriptionAr: '', 
    descriptionEn: '', 
    deptType: 'RECEIVER_ONLY', 
    isActive: true 
  });
  
  const { accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];
  const isMounted = useRef(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/admin/departments', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (isMounted.current) setDepartments(data);
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      if (isMounted.current) console.error('Error fetching departments:', error);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingDept ? `/api/admin/departments/${editingDept.id}` : '/api/admin/departments';
    const method = editingDept ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        fetchDepartments();
        setIsModalOpen(false);
        setEditingDept(null);
        setFormData({ 
          nameAr: '', 
          nameEn: '', 
          descriptionAr: '', 
          descriptionEn: '', 
          deptType: 'RECEIVER_ONLY', 
          isActive: true 
        });
      }
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error saving department:', error);
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-main)]">
            {t.departmentsManagement}
          </h2>
          <p className="text-[var(--text-secondary)]">
            {t.departmentsManagementDesc}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingDept(null);
            setFormData({ 
              nameAr: '', 
              nameEn: '', 
              descriptionAr: '', 
              descriptionEn: '', 
              deptType: 'RECEIVER_ONLY', 
              isActive: true 
            });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-primary-blue text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-800 transition-all"
        >
          <Plus size={20} />
          {t.addDepartment}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-[var(--text-muted)]">Loading...</div>
        ) : departments.map((dept) => (
          <motion.div
            layout
            key={dept.id}
            className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] p-6 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-primary-blue">
                  <Users size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-main)]">
                    {language === 'ar' ? dept.nameAr : dept.nameEn}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {language === 'ar' ? dept.nameEn : dept.nameAr}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingDept(dept);
                    setFormData({ 
                      nameAr: dept.nameAr, 
                      nameEn: dept.nameEn, 
                      descriptionAr: dept.descriptionAr || '', 
                      descriptionEn: dept.descriptionEn || '', 
                      deptType: dept.deptType, 
                      isActive: dept.isActive 
                    });
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-[var(--text-muted)] hover:text-primary-blue transition-all"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            </div>
            
            <p className="text-sm text-[var(--text-secondary)] mb-6 line-clamp-2 min-h-[2.5rem]">
              {language === 'ar' ? dept.descriptionAr : dept.descriptionEn}
            </p>
            
            <div className="flex items-center justify-between pt-4 border-t border-[var(--border-dim)]">
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                  <Users size={14} />
                  {dept._count?.users || 0} {t.employees}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                  <Shield size={14} />
                  {dept.deptType.replace('_', ' ')}
                </div>
              </div>
              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                dept.isActive ? 'bg-success-green/10 text-success-green' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
              }`}>
                {dept.isActive ? t.active : t.inactive}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--bg-surface)] w-full max-w-2xl rounded-2xl shadow-2xl border border-[var(--border-main)] overflow-hidden"
          >
            <div className="p-6 border-b border-[var(--border-dim)] flex items-center justify-between">
              <h3 className="text-xl font-bold text-[var(--text-main)]">
                {editingDept ? t.editDepartment : t.addNewDepartment}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                    {t.nameArabic}
                  </label>
                  <input
                    type="text"
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                    {t.nameEnglish}
                  </label>
                  <input
                    type="text"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                    {t.descriptionArabic}
                  </label>
                  <textarea
                    value={formData.descriptionAr}
                    onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue min-h-[100px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                    {t.descriptionEnglish}
                  </label>
                  <textarea
                    value={formData.descriptionEn}
                    onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue min-h-[100px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                    {t.departmentType}
                  </label>
                  <select
                    value={formData.deptType}
                    onChange={(e) => setFormData({ ...formData, deptType: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                  >
                    <option value="RECEIVER_ONLY">{t.receiverOnly}</option>
                    <option value="SENDER_ONLY">{t.senderOnly}</option>
                    <option value="BOTH">{t.both}</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-8">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-5 h-5 rounded border-[var(--border-main)] text-primary-blue focus:ring-primary-blue"
                  />
                  <label htmlFor="isActive" className="text-sm font-bold text-[var(--text-secondary)]">
                    {t.active}
                  </label>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-[var(--border-main)] text-[var(--text-secondary)] font-bold hover:bg-[var(--border-dim)] transition-all"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-xl bg-primary-blue text-white font-bold hover:bg-blue-800 transition-all"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
