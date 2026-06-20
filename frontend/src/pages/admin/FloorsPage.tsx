import React, { useState, useEffect, useRef } from 'react';
import ErrorBanner from '../../components/ErrorBanner.tsx';
import { useAuthStore } from '../../store/authStore.ts';
import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { Layers, Plus, Edit2, Trash2, X } from 'lucide-react';
import { motion } from 'motion/react';

interface Building {
  id: number;
  nameAr: string;
  nameEn: string;
}

interface Floor {
  id: number;
  nameAr: string;
  nameEn: string;
  buildingId: number;
  isActive: boolean;
  building?: Building;
}

export default function FloorsPage() {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null);
  const [formData, setFormData] = useState({ nameAr: '', nameEn: '', buildingId: '', isActive: true });
  
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
      const [floorsRes, buildingsRes] = await Promise.all([
        fetch('/api/admin/floors', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/admin/buildings', { headers: { Authorization: `Bearer ${accessToken}` } })
      ]);
      const floorsData = await floorsRes.json();
      const buildingsData = await buildingsRes.json();
      if (isMounted.current) setFloors(floorsData);
      if (isMounted.current) setBuildings(buildingsData);
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      if (isMounted.current) console.error('Error fetching data:', error);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingFloor ? `/api/admin/floors/${editingFloor.id}` : '/api/admin/floors';
    const method = editingFloor ? 'PUT' : 'POST';

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
        fetchData();
        setIsModalOpen(false);
        setEditingFloor(null);
        setFormData({ nameAr: '', nameEn: '', buildingId: '', isActive: true });
      }
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error saving floor:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذا الطابق؟' : 'Are you sure you want to delete this floor?')) return;
    try {
      const res = await fetch(`/api/admin/floors/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) fetchData();
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error deleting floor:', error);
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-main)]">
            {t.floorsManagement}
          </h2>
          <p className="text-[var(--text-secondary)]">
            {t.floorsManagementDesc}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingFloor(null);
            setFormData({ nameAr: '', nameEn: '', buildingId: buildings[0]?.id.toString() || '', isActive: true });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-primary-blue text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-800 transition-all"
        >
          <Plus size={20} />
          {t.addFloor}
        </button>
      </div>

      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--border-dim)]/50 border-b border-[var(--border-main)]">
              <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                {t.floor}
              </th>
              <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                {t.building}
              </th>
              <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                {t.status}
              </th>
              <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest text-right">
                {t.actions}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-dim)]">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-[var(--text-muted)]">Loading...</td></tr>
            ) : floors.map((floor) => (
              <tr key={floor.id} className="hover:bg-[var(--border-dim)] transition-all">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center text-primary-blue">
                      <Layers size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-[var(--text-main)]">
                        {language === 'ar' ? floor.nameAr : floor.nameEn}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {language === 'ar' ? floor.nameEn : floor.nameAr}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-[var(--text-secondary)]">
                    {language === 'ar' ? floor.building?.nameAr : floor.building?.nameEn}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                    floor.isActive ? 'bg-success-green/10 text-success-green' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                  }`}>
                    {floor.isActive ? t.active : t.inactive}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setEditingFloor(floor);
                        setFormData({ 
                          nameAr: floor.nameAr, 
                          nameEn: floor.nameEn, 
                          buildingId: floor.buildingId.toString(), 
                          isActive: floor.isActive 
                        });
                        setIsModalOpen(true);
                      }}
                      className="p-2 text-[var(--text-muted)] hover:text-primary-blue transition-all"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(floor.id)}
                      className="p-2 text-[var(--text-muted)] hover:text-danger-red transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                {editingFloor ? t.editFloor : t.addNewFloor}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                  {t.building}
                </label>
                <select
                  value={formData.buildingId}
                  onChange={(e) => setFormData({ ...formData, buildingId: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                  required
                >
                  <option value="">{t.selectBuilding}</option>
                  {buildings.map(b => (
                    <option key={b.id} value={b.id}>{language === 'ar' ? b.nameAr : b.nameEn}</option>
                  ))}
                </select>
              </div>
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
