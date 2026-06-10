import React, { useState, useEffect, useRef } from 'react';
import ErrorBanner from '../../components/ErrorBanner.tsx';
import { useAuthStore } from '../../store/authStore.ts';
import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { Building2, Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import { motion } from 'motion/react';

interface Building {
  id: number;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
  _count?: { floors: number };
}

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [formData, setFormData] = useState({ nameAr: '', nameEn: '', isActive: true });
  
  const { accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];
  const isMounted = useRef(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    fetchBuildings();
  }, []);

  const fetchBuildings = async () => {
    try {
      const res = await fetch('/api/admin/buildings', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (isMounted.current) setBuildings(data);
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      if (isMounted.current) console.error('Error fetching buildings:', error);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingBuilding ? `/api/admin/buildings/${editingBuilding.id}` : '/api/admin/buildings';
    const method = editingBuilding ? 'PUT' : 'POST';

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
        fetchBuildings();
        setIsModalOpen(false);
        setEditingBuilding(null);
        setFormData({ nameAr: '', nameEn: '', isActive: true });
      }
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error saving building:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذا المبنى؟' : 'Are you sure you want to delete this building?')) return;
    try {
      const res = await fetch(`/api/admin/buildings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) fetchBuildings();
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error deleting building:', error);
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-main)]">
            {t.buildingsManagement}
          </h2>
          <p className="text-[var(--text-secondary)]">
            {t.buildingsManagementDesc}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingBuilding(null);
            setFormData({ nameAr: '', nameEn: '', isActive: true });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-primary-blue text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-800 transition-all"
        >
          <Plus size={20} />
          {t.addBuilding}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-[var(--text-muted)]">Loading...</div>
        ) : buildings.map((building) => (
          <motion.div
            layout
            key={building.id}
            className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] p-6 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-primary-blue/10 rounded-xl flex items-center justify-center text-primary-blue">
                <Building2 size={24} />
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={() => {
                    setEditingBuilding(building);
                    setFormData({ nameAr: building.nameAr, nameEn: building.nameEn, isActive: building.isActive });
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-[var(--text-muted)] hover:text-primary-blue hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(building.id)}
                  className="p-2 text-[var(--text-muted)] hover:text-danger-red hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-[var(--text-main)] mb-1">
              {language === 'ar' ? building.nameAr : building.nameEn}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {language === 'ar' ? building.nameEn : building.nameAr}
            </p>
            
            <div className="flex items-center justify-between pt-4 border-t border-[var(--border-dim)]">
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                {building._count?.floors || 0} {t.floors}
              </span>
              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                building.isActive ? 'bg-success-green/10 text-success-green' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
              }`}>
                {building.isActive ? t.active : t.inactive}
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
                {editingBuilding ? t.editBuilding : t.addNewBuilding}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
