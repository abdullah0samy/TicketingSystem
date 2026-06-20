import React, { useState, useEffect, useRef } from 'react';
import ErrorBanner from '../../components/ErrorBanner.tsx';
import { useAuthStore } from '../../store/authStore.ts';
import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Package, 
  MapPin, 
  Building2, 
  Calendar, 
  ShieldCheck,
  Filter,
  Download,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Asset {
  id: number;
  name: string;
  serialNumber: string | null;
  type: string;
  location: string | null;
  departmentId: number | null;
  status: string;
  purchaseDate: string | null;
  warrantyExpiry: string | null;
  department?: { nameEn: string; nameAr: string };
}

interface Department {
  id: number;
  nameEn: string;
  nameAr: string;
}

export default function AssetManagementPage() {
  const { accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];
  const [assets, setAssets] = useState<Asset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [formData, setFormData] = useState<Partial<Asset>>({
    name: '',
    serialNumber: '',
    type: 'IT Hardware',
    location: '',
    departmentId: null,
    status: 'active',
    purchaseDate: '',
    warrantyExpiry: ''
  });
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
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [assetsRes, deptsRes] = await Promise.all([
        fetch('/api/assets', { headers }),
        fetch('/api/admin/departments', { headers })
      ]);
      
      if (isMounted.current && assetsRes.ok && deptsRes.ok) {
        setAssets(await assetsRes.json());
        setDepartments(await deptsRes.json());
      }
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      if (isMounted.current) console.error('Error fetching data:', error);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingAsset ? 'PUT' : 'POST';
      const url = editingAsset ? `/api/assets/${editingAsset.id}` : '/api/assets';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setIsModalOpen(false);
        setEditingAsset(null);
        setFormData({
          name: '',
          serialNumber: '',
          type: 'IT Hardware',
          location: '',
          departmentId: null,
          status: 'active',
          purchaseDate: '',
          warrantyExpiry: ''
        });
        fetchData();
      }
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error saving asset:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t.deleteAssetConfirm)) return;
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) fetchData();
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error deleting asset:', error);
    }
  };

  const filteredAssets = assets.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.serialNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center text-[var(--text-muted)]">Loading assets...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">
            {t.assetManagement}
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {t.assetManagementDesc}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              setEditingAsset(null);
              setFormData({ name: '', serialNumber: '', type: 'IT Hardware', status: 'active' });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-blue text-white font-bold hover:bg-blue-800 transition-all shadow-lg shadow-primary-blue/20"
          >
            <Plus size={18} />
            {t.addAsset}
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: t.totalAssets, value: assets.length, icon: Package, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: t.active, value: assets.filter(a => a.status === 'active').length, icon: ShieldCheck, color: 'text-green-500', bg: 'bg-green-500/10' },
          { label: t.maintenance, value: assets.filter(a => a.status === 'maintenance').length, icon: Calendar, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          { label: t.retired, value: assets.filter(a => a.status === 'retired').length, icon: Trash2, color: 'text-[var(--text-secondary)]', bg: 'bg-[var(--bg-main)]0/10' },
        ].map((stat, i) => (
          <div key={i} className="bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border-main)] flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{stat.label}</p>
              <p className="text-xl font-bold text-[var(--text-main)]">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border-main)] flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
          <input 
            type="text"
            placeholder={t.searchAssets}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] text-sm outline-none focus:ring-2 focus:ring-primary-blue"
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-xl border border-[var(--border-main)] text-[var(--text-secondary)] hover:bg-[var(--border-dim)]">
            <Filter size={18} />
          </button>
          <button className="p-2 rounded-xl border border-[var(--border-main)] text-[var(--text-secondary)] hover:bg-[var(--border-dim)]">
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Assets Table */}
      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--border-dim)]/50 border-b border-[var(--border-dim)]">
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.asset}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.type}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.location}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.department}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.status}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-dim)]">
              {filteredAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-[var(--border-dim)] transition-all group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                        <Package size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[var(--text-main)]">{asset.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{asset.serialNumber || 'No Serial'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-[var(--text-secondary)]">{asset.type}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <MapPin size={14} />
                      {asset.location || (language === 'ar' ? 'غير متوفر' : 'N/A')}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Building2 size={14} />
                      {(language === 'ar' ? asset.department?.nameAr : asset.department?.nameEn) || (language === 'ar' ? 'غير متوفر' : 'N/A')}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${
                      asset.status === 'active' ? 'bg-green-100 text-green-600 dark:bg-green-900/30' :
                      asset.status === 'maintenance' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' :
                      'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                    }`}>
                      {asset.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => {
                          setEditingAsset(asset);
                          setFormData(asset);
                          setIsModalOpen(true);
                        }}
                        className="p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(asset.id)}
                        className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"
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
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--bg-surface)] w-full max-w-2xl rounded-3xl shadow-2xl border border-[var(--border-main)] overflow-hidden"
            >
              <div className="p-6 border-b border-[var(--border-dim)] flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--text-main)]">
                  {editingAsset ? t.editAsset : t.addNewAsset}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">&times;</button>
              </div>
              <form onSubmit={handleSave} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.assetName}</label>
                    <input 
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.serialNumber}</label>
                    <input 
                      value={formData.serialNumber || ''}
                      onChange={(e) => setFormData({...formData, serialNumber: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.type}</label>
                    <select 
                      value={formData.type}
                      onChange={(e) => setFormData({...formData, type: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                    >
                      <option value="IT Hardware">IT Hardware</option>
                      <option value="Medical Device">Medical Device</option>
                      <option value="Furniture">Furniture</option>
                      <option value="Infrastructure">Infrastructure</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.status}</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                    >
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="retired">Retired</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.location}</label>
                    <input 
                      value={formData.location || ''}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.department}</label>
                    <select 
                      value={formData.departmentId || ''}
                      onChange={(e) => setFormData({...formData, departmentId: e.target.value ? parseInt(e.target.value) : null})}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                    >
                      <option value="">Select Department</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{language === 'ar' ? d.nameAr : d.nameEn}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-6 border-t border-[var(--border-dim)]">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2 rounded-xl border border-[var(--border-main)] text-[var(--text-secondary)] font-bold hover:bg-[var(--border-dim)] transition-all"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit"
                    className="px-8 py-2 rounded-xl bg-primary-blue text-white font-bold hover:bg-blue-800 transition-all shadow-lg shadow-primary-blue/20"
                  >
                    {t.save}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
