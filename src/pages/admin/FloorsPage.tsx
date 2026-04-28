import React, { useState, useEffect } from 'react';
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
      setFloors(floorsData);
      setBuildings(buildingsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
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
      console.error('Error saving floor:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this floor?')) return;
    try {
      const res = await fetch(`/api/admin/floors/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) fetchData();
    } catch (error) {
      console.error('Error deleting floor:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {language === 'ar' ? 'إدارة الطوابق' : 'Floors Management'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            {language === 'ar' ? 'إدارة طوابق مباني المستشفى' : 'Manage floors for hospital buildings'}
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
          {language === 'ar' ? 'إضافة طابق' : 'Add Floor'}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                {language === 'ar' ? 'الطابق' : 'Floor'}
              </th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                {language === 'ar' ? 'المبنى' : 'Building'}
              </th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                {language === 'ar' ? 'الحالة' : 'Status'}
              </th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">
                {language === 'ar' ? 'إجراءات' : 'Actions'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">Loading...</td></tr>
            ) : floors.map((floor) => (
              <tr key={floor.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center text-primary-blue">
                      <Layers size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {language === 'ar' ? floor.nameAr : floor.nameEn}
                      </p>
                      <p className="text-xs text-slate-400">
                        {language === 'ar' ? floor.nameEn : floor.nameAr}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {language === 'ar' ? floor.building?.nameAr : floor.building?.nameEn}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                    floor.isActive ? 'bg-success-green/10 text-success-green' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {floor.isActive ? (language === 'ar' ? 'نشط' : 'Active') : (language === 'ar' ? 'غير نشط' : 'Inactive')}
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
                      className="p-2 text-slate-400 hover:text-primary-blue transition-all"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(floor.id)}
                      className="p-2 text-slate-400 hover:text-danger-red transition-all"
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
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingFloor ? (language === 'ar' ? 'تعديل طابق' : 'Edit Floor') : (language === 'ar' ? 'إضافة طابق جديد' : 'Add New Floor')}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  {language === 'ar' ? 'المبنى' : 'Building'}
                </label>
                <select
                  value={formData.buildingId}
                  onChange={(e) => setFormData({ ...formData, buildingId: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-blue"
                  required
                >
                  <option value="">{language === 'ar' ? 'اختر المبنى' : 'Select Building'}</option>
                  {buildings.map(b => (
                    <option key={b.id} value={b.id}>{language === 'ar' ? b.nameAr : b.nameEn}</option>
                  ))}
                </select>
              </div>
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
