import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/admin/departments', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      setDepartments(data);
    } catch (error) {
      console.error('Error fetching departments:', error);
    } finally {
      setLoading(false);
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
      console.error('Error saving department:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {language === 'ar' ? 'إدارة الأقسام' : 'Departments Management'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            {language === 'ar' ? 'إدارة أقسام المستشفى وصلاحياتها' : 'Manage hospital departments and their permissions'}
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
          {language === 'ar' ? 'إضافة قسم' : 'Add Department'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-slate-400">Loading...</div>
        ) : departments.map((dept) => (
          <motion.div
            layout
            key={dept.id}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-primary-blue">
                  <Users size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {language === 'ar' ? dept.nameAr : dept.nameEn}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
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
                  className="p-2 text-slate-400 hover:text-primary-blue transition-all"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            </div>
            
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 line-clamp-2 min-h-[2.5rem]">
              {language === 'ar' ? dept.descriptionAr : dept.descriptionEn}
            </p>
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                  <Users size={14} />
                  {dept._count?.users || 0} {language === 'ar' ? 'موظف' : 'Users'}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                  <Shield size={14} />
                  {dept.deptType.replace('_', ' ')}
                </div>
              </div>
              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                dept.isActive ? 'bg-success-green/10 text-success-green' : 'bg-slate-100 text-slate-400'
              }`}>
                {dept.isActive ? (language === 'ar' ? 'نشط' : 'Active') : (language === 'ar' ? 'غير نشط' : 'Inactive')}
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
            className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingDept ? (language === 'ar' ? 'تعديل قسم' : 'Edit Department') : (language === 'ar' ? 'إضافة قسم جديد' : 'Add New Department')}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    {language === 'ar' ? 'الوصف بالعربية' : 'Description (Arabic)'}
                  </label>
                  <textarea
                    value={formData.descriptionAr}
                    onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-blue min-h-[100px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    {language === 'ar' ? 'الوصف بالإنجليزية' : 'Description (English)'}
                  </label>
                  <textarea
                    value={formData.descriptionEn}
                    onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-blue min-h-[100px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    {language === 'ar' ? 'نوع القسم' : 'Department Type'}
                  </label>
                  <select
                    value={formData.deptType}
                    onChange={(e) => setFormData({ ...formData, deptType: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-blue"
                  >
                    <option value="RECEIVER_ONLY">{language === 'ar' ? 'مستقبل فقط (مثال: IT)' : 'Receiver Only (e.g. IT)'}</option>
                    <option value="SENDER_ONLY">{language === 'ar' ? 'مرسل فقط (مثال: التمريض)' : 'Sender Only (e.g. Nursing)'}</option>
                    <option value="BOTH">{language === 'ar' ? 'كلاهما' : 'Both'}</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-8">
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
