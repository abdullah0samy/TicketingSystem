import React, { useState, useEffect, useRef } from 'react';
import ErrorBanner from '../../components/ErrorBanner.tsx';
import { useAuthStore } from '../../store/authStore.ts';
import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { Tag, Plus, Edit2, Trash2, X, Palette } from 'lucide-react';
import { motion } from 'motion/react';

interface Department {
  id: number;
  nameAr: string;
  nameEn: string;
}

interface TicketType {
  id: number;
  nameAr: string;
  nameEn: string;
  departmentId: number | null;
  color: string;
  displayOrder: number;
  isActive: boolean;
  department?: Department;
}

export default function TicketTypesPage() {
  const [types, setTypes] = useState<TicketType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<TicketType | null>(null);
  const [formData, setFormData] = useState({ 
    nameAr: '', 
    nameEn: '', 
    departmentId: '', 
    color: '#6B7280', 
    displayOrder: 0, 
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
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [typesRes, deptsRes] = await Promise.all([
        fetch('/api/admin/ticket-types', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/admin/departments', { headers: { Authorization: `Bearer ${accessToken}` } })
      ]);
      const typesData = await typesRes.json();
      const deptsData = await deptsRes.json();
      if (isMounted.current) setTypes(typesData);
      if (isMounted.current) setDepartments(deptsData);
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      if (isMounted.current) console.error('Error fetching data:', error);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingType ? `/api/admin/ticket-types/${editingType.id}` : '/api/admin/ticket-types';
    const method = editingType ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ...formData,
          departmentId: formData.departmentId ? parseInt(formData.departmentId) : null,
          displayOrder: parseInt(formData.displayOrder.toString())
        })
      });

      if (res.ok) {
        fetchData();
        setIsModalOpen(false);
        setEditingType(null);
        setFormData({ nameAr: '', nameEn: '', departmentId: '', color: '#6B7280', displayOrder: 0, isActive: true });
      }
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error saving ticket type:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذا النوع؟' : 'Are you sure you want to delete this ticket type?')) return;
    try {
      const res = await fetch(`/api/admin/ticket-types/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) fetchData();
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error deleting ticket type:', error);
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-main)]">
            {t.ticketTypes}
          </h2>
          <p className="text-[var(--text-secondary)]">
            {t.ticketTypesDesc}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingType(null);
            setFormData({ nameAr: '', nameEn: '', departmentId: '', color: '#6B7280', displayOrder: 0, isActive: true });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-primary-blue text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-800 transition-all"
        >
          <Plus size={20} />
          {t.addType}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-[var(--text-muted)]">Loading...</div>
        ) : types.map((type) => (
          <motion.div
            layout
            key={type.id}
            className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] p-6 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${type.color}20`, color: type.color }}>
                <Tag size={24} />
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={() => {
                    setEditingType(type);
                    setFormData({ 
                      nameAr: type.nameAr, 
                      nameEn: type.nameEn, 
                      departmentId: type.departmentId?.toString() || '', 
                      color: type.color, 
                      displayOrder: type.displayOrder, 
                      isActive: type.isActive 
                    });
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-[var(--text-muted)] hover:text-primary-blue transition-all"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(type.id)}
                  className="p-2 text-[var(--text-muted)] hover:text-danger-red transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-[var(--text-main)] mb-1">
              {language === 'ar' ? type.nameAr : type.nameEn}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              {type.department ? (language === 'ar' ? type.department.nameAr : type.department.nameEn) : t.general}
            </p>
            
            <div className="flex items-center justify-between pt-4 border-t border-[var(--border-dim)]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: type.color }} />
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{type.color}</span>
              </div>
              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                type.isActive ? 'bg-success-green/10 text-success-green' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
              }`}>
                {type.isActive ? t.active : t.inactive}
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
            className="bg-[var(--bg-surface)] w-full max-w-md rounded-2xl shadow-2xl border border-[var(--border-main)] overflow-hidden"
          >
            <div className="p-6 border-b border-[var(--border-dim)] flex items-center justify-between">
              <h3 className="text-xl font-bold text-[var(--text-main)]">
                {editingType ? t.editType : t.addNewType}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
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

              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                  {t.responsibleDepartment}
                </label>
                <select
                  value={formData.departmentId}
                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                >
                  <option value="">{t.generalNoDepartment}</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{language === 'ar' ? d.nameAr : d.nameEn}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                    {t.color}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-10 h-10 rounded border-none outline-none cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="flex-1 px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue font-mono text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                    {t.order}
                  </label>
                  <input
                    type="number"
                    value={formData.displayOrder}
                    onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 py-2">
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
