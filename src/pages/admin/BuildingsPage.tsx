import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    fetchBuildings();
  }, []);

  const fetchBuildings = async () => {
    try {
      const res = await fetch('/api/admin/buildings', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      setBuildings(data);
    } catch (error) {
      console.error('Error fetching buildings:', error);
    } finally {
      setLoading(false);
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
      console.error('Error saving building:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this building?')) return;
    try {
      const res = await fetch(`/api/admin/buildings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) fetchBuildings();
    } catch (error) {
      console.error('Error deleting building:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {language === 'ar' ? 'إدارة المباني' : 'Buildings Management'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            {language === 'ar' ? 'إضافة وتعديل مباني المستشفى' : 'Add and edit hospital buildings'}
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
          {language === 'ar' ? 'إضافة مبنى' : 'Add Building'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-slate-400">Loading...</div>
        ) : buildings.map((building) => (
          <motion.div
            layout
            key={building.id}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-primary-blue/10 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-primary-blue">
                <Building2 size={24} />
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={() => {
                    setEditingBuilding(building);
                    setFormData({ nameAr: building.nameAr, nameEn: building.nameEn, isActive: building.isActive });
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-slate-400 hover:text-primary-blue hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(building.id)}
                  className="p-2 text-slate-400 hover:text-danger-red hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {language === 'ar' ? building.nameAr : building.nameEn}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {language === 'ar' ? building.nameEn : building.nameAr}
            </p>
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {building._count?.floors || 0} {language === 'ar' ? 'طوابق' : 'Floors'}
              </span>
              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                building.isActive ? 'bg-success-green/10 text-success-green' : 'bg-slate-100 text-slate-400'
              }`}>
                {building.isActive ? (language === 'ar' ? 'نشط' : 'Active') : (language === 'ar' ? 'غير نشط' : 'Inactive')}
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
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingBuilding ? (language === 'ar' ? 'تعديل مبنى' : 'Edit Building') : (language === 'ar' ? 'إضافة مبنى جديد' : 'Add New Building')}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  {language === 'ar' ? 'الاسم بالعربية' : 'Name (Arabic)'}
                </label>
                <input
                  type="text"
                  value={formData.nameAr}
                  onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-blue"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  {language === 'ar' ? 'الاسم بالإنجليزية' : 'Name (English)'}
                </label>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-blue"
                  required
                />
              </div>
              <div className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-5 h-5 rounded border-slate-300 text-primary-blue focus:ring-primary-blue"
                />
                <label htmlFor="isActive" className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {language === 'ar' ? 'نشط' : 'Active'}
                </label>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-xl bg-primary-blue text-white font-bold hover:bg-blue-800 transition-all"
                >
                  {language === 'ar' ? 'حفظ' : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
