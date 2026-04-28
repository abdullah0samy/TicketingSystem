import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { translations } from '../core/translations.ts';
import { apiFetch } from '../core/api.ts';
import { 
  Activity, 
  Ticket, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp, 
  Users, 
  PlusCircle,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  FileSpreadsheet,
  History,
  Calendar,
  ExternalLink,
  Search,
  BookOpen,
  Package
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { motion } from 'motion/react';

interface Stats {
  total: number;
  pending: number;
  resolved: number;
  open: number;
  overdue: number;
  avgResolutionTimeHours: number;
}

interface Distribution {
  status?: string;
  priority?: string;
  count: number;
}

interface DeptPerformance {
  nameAr: string;
  nameEn: string;
  count: number;
}

interface AgentPerformance {
  id: number;
  nameEn: string;
  nameAr: string;
  department: string;
  resolvedCount: number;
  avgResolutionTimeHours: number;
  avgResponseTimeHours: number;
  slaAdherenceRate: number;
}

interface AssetSummary {
  total: number;
  active: number;
  maintenance: number;
  retired: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusDist, setStatusDist] = useState<Distribution[]>([]);
  const [priorityDist, setPriorityDist] = useState<Distribution[]>([]);
  const [deptPerf, setDeptPerf] = useState<DeptPerformance[]>([]);
  const [agentPerf, setAgentPerf] = useState<AgentPerformance[]>([]);
  const [assetSummary, setAssetSummary] = useState<AssetSummary | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [exportHistory, setExportHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'exports'>('overview');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  const { accessToken, user } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const fetch = async () => {
      try {
        await fetchDashboardData(controller.signal);
      } catch (error) {
        if (isMounted) console.error('Error fetching dashboard data:', error);
      }
    };
    fetch();
    return () => {
      controller.abort();
      isMounted = false;
    };
  }, []);

  const fetchDashboardData = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/analytics/dashboard-summary', { signal });
      
      setStats(data.stats);
      setStatusDist(data.statusDistribution);
      setPriorityDist(data.priorityDistribution);
      setDeptPerf(data.departmentPerformance);
      setRecentActivity(data.recentActivity);
      setAgentPerf(data.agentPerformance);
      setExportHistory(data.exportHistory || []);
      setAssetSummary(data.assetSummary || null);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Error fetching dashboard data:', error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const fetchExportHistory = async (signal?: AbortSignal) => {
    try {
      const data = await apiFetch('/api/analytics/exports', { signal });
      setExportHistory(data);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Error fetching export history:', error);
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        startDate: exportStartDate,
        endDate: exportEndDate
      });
      const res = await fetch(`/api/analytics/export?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tickets_report_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        fetchExportHistory();
      }
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  if (loading) return <div className="p-8 text-center text-slate-400">Loading dashboard data...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            {t.welcome}, {user?.fullNameEn || user?.fullNameAr} 👋
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {language === 'ar' ? 'إليك نظرة سريعة على نشاط اليوم' : "Here's a quick look at today's activity"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex premium-card p-1 shadow-sm">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'overview' ? 'bg-primary-blue text-white shadow-md' : 'text-slate-500 hover:text-primary-blue'}`}
            >
              {language === 'ar' ? 'نظرة عامة' : 'Overview'}
            </button>
            <button 
              onClick={() => setActiveTab('exports')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'exports' ? 'bg-primary-blue text-white shadow-md' : 'text-slate-500 hover:text-primary-blue'}`}
            >
              {language === 'ar' ? 'سجل التصدير' : 'Export History'}
            </button>
          </div>
          <div className="flex items-center gap-3 premium-card p-2 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-primary-blue/10 flex items-center justify-center text-primary-blue">
              <Activity size={20} />
            </div>
            <div className="pr-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{language === 'ar' ? 'الحالة' : 'System Status'}</p>
              <p className="text-sm font-bold text-success-green">{language === 'ar' ? 'يعمل بشكل جيد' : 'Operational'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Knowledge Base Quick Search */}
      <div className="bg-gradient-to-r from-primary-blue to-blue-700 p-8 rounded-[2rem] shadow-xl shadow-primary-blue/20 text-white">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold mb-2">{language === 'ar' ? 'كيف يمكننا مساعدتك اليوم؟' : 'How can we help you today?'}</h2>
          <p className="text-blue-100 mb-6">{language === 'ar' ? 'ابحث في قاعدة المعرفة عن حلول سريعة لمشاكلك' : 'Search our knowledge base for quick solutions to your problems'}</p>
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300 group-focus-within:text-white transition-colors" size={20} />
            <input 
              type="text"
              placeholder={language === 'ar' ? 'ابحث عن مقالات، أدلة، أو حلول...' : 'Search for articles, guides, or solutions...'}
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white placeholder:text-blue-200 outline-none focus:ring-2 focus:ring-white/50 transition-all"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  window.location.href = `/knowledge?search=${(e.target as HTMLInputElement).value}`;
                }
              }}
            />
          </div>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: language === 'ar' ? 'إجمالي التذاكر' : 'Total Tickets', value: stats?.total, icon: Ticket, color: 'text-primary-blue', bg: 'bg-primary-blue/10' },
              { label: language === 'ar' ? 'قيد الانتظار' : 'Pending', value: stats?.pending, icon: Clock, color: 'text-warning-amber', bg: 'bg-warning-amber/10' },
              { label: language === 'ar' ? 'تم الحل' : 'Resolved', value: stats?.resolved, icon: CheckCircle2, color: 'text-success-green', bg: 'bg-success-green/10' },
              { label: language === 'ar' ? 'تجاوز المهلة' : 'Overdue', value: stats?.overdue, icon: AlertCircle, color: 'text-danger-red', bg: 'bg-danger-red/10' },
              { label: language === 'ar' ? 'متوسط الحل' : 'Avg Resolution', value: `${stats?.avgResolutionTimeHours}h`, icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10' },
            ].map((kpi, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="premium-card p-6 group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-2xl ${kpi.bg} flex items-center justify-center ${kpi.color}`}>
                    <kpi.icon size={24} />
                  </div>
                  <div className="flex items-center gap-1 text-success-green text-xs font-bold">
                    <ArrowUpRight size={14} />
                    <span>12%</span>
                  </div>
                </div>
                <p className="text-sm font-bold text-slate-400 dark:text-slate-300 uppercase tracking-widest mb-1">{kpi.label}</p>
                <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{kpi.value}</h3>
              </motion.div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div 
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: '/tickets/new' }))}
              className="premium-card p-6 group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl text-blue-600 group-hover:bg-primary-blue group-hover:text-white transition-all">
                  <PlusCircle size={24} />
                </div>
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{language === 'ar' ? 'تذكرة جديدة' : 'New Ticket'}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{language === 'ar' ? 'افتح تذكرة دعم جديدة' : 'Open a new support ticket'}</div>
            </div>

            <div 
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: '/team-feed' }))}
              className="premium-card p-6 group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <Users size={24} />
                </div>
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{language === 'ar' ? 'ساحة الفريق' : 'Team Feed'}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{language === 'ar' ? 'تواصل مع زملائك وشارك المعرفة' : 'Connect with colleagues and share knowledge'}</div>
            </div>

            <div 
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: '/knowledge' }))}
              className="premium-card p-6 group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all">
                  <BookOpen size={24} />
                </div>
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{language === 'ar' ? 'قاعدة المعرفة' : 'Knowledge Base'}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{language === 'ar' ? 'ابحث عن حلول وأدلة' : 'Search for solutions and guides'}</div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Status Distribution */}
            <div className="lg:col-span-2 premium-card p-6">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity size={18} className="text-primary-blue" />
                  {language === 'ar' ? 'توزيع الحالات' : 'Status Distribution'}
                </h3>
                <select className="text-xs font-bold text-slate-400 dark:text-slate-400 bg-transparent outline-none">
                  <option>Last 7 Days</option>
                  <option>Last 30 Days</option>
                </select>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusDist}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-main)" />
                    <XAxis 
                      dataKey="status" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    />
                    <Tooltip 
                      cursor={{ fill: 'currentColor', opacity: 0.1 }}
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: '1px solid var(--border-main)', 
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                        backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-main)'
                      }}
                      itemStyle={{ color: 'var(--text-main)' }}
                    />
                    <Bar dataKey="count" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Priority Pie Chart */}
            <div className="premium-card p-6">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-8">
                <AlertCircle size={18} className="text-danger-red" />
                {language === 'ar' ? 'الأولوية' : 'Priority Breakdown'}
              </h3>
              <div className="h-[300px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={priorityDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="count"
                      nameKey="priority"
                      stroke="none"
                    >
                      {priorityDist.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: '1px solid var(--border-main)',
                        backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-main)'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.total}</span>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total</span>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {priorityDist.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-600 dark:text-slate-400 capitalize font-medium">{p.priority}</span>
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Performance */}
            <div className="premium-card p-6">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-8">
                <Building2 size={18} className="text-primary-blue" />
                {language === 'ar' ? 'أداء الأقسام' : 'Department Tickets'}
              </h3>
              <div className="space-y-6">
                {deptPerf.map((dept, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {language === 'ar' ? dept.nameAr : dept.nameEn}
                      </span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{dept.count}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(dept.count / (stats?.total || 1)) * 100}%` }}
                        className="h-full bg-primary-blue"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Asset Summary */}
            <div className="premium-card p-6">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-8">
                <Package size={18} className="text-primary-blue" />
                {language === 'ar' ? 'ملخص الأصول' : 'Asset Summary'}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{language === 'ar' ? 'إجمالي الأصول' : 'Total Assets'}</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{assetSummary?.total || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-success-green/5 border border-success-green/10">
                  <p className="text-[10px] font-bold text-success-green uppercase tracking-widest mb-1">{language === 'ar' ? 'نشط' : 'Active'}</p>
                  <p className="text-2xl font-bold text-success-green">{assetSummary?.active || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-warning-amber/5 border border-warning-amber/10">
                  <p className="text-[10px] font-bold text-warning-amber uppercase tracking-widest mb-1">{language === 'ar' ? 'صيانة' : 'Maintenance'}</p>
                  <p className="text-2xl font-bold text-warning-amber">{assetSummary?.maintenance || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-danger-red/5 border border-danger-red/10">
                  <p className="text-[10px] font-bold text-danger-red uppercase tracking-widest mb-1">{language === 'ar' ? 'متقاعد' : 'Retired'}</p>
                  <p className="text-2xl font-bold text-danger-red">{assetSummary?.retired || 0}</p>
                </div>
              </div>
              <button 
                onClick={() => window.location.href = '/admin/assets'}
                className="w-full mt-6 py-3 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
              >
                {language === 'ar' ? 'إدارة الأصول' : 'Manage Assets'}
                <ExternalLink size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Agent Performance Table */}
            <div className="lg:col-span-2 premium-card p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp size={18} className="text-primary-blue" />
                  {language === 'ar' ? 'أداء الوكلاء' : 'Agent Performance'}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                      <th className="pb-4">{language === 'ar' ? 'الوكيل' : 'Agent'}</th>
                      <th className="pb-4">{language === 'ar' ? 'تم الحل' : 'Resolved'}</th>
                      <th className="pb-4">{language === 'ar' ? 'متوسط الاستجابة' : 'Avg Response'}</th>
                      <th className="pb-4">{language === 'ar' ? 'متوسط الحل' : 'Avg Resolution'}</th>
                      <th className="pb-4">{language === 'ar' ? 'الالتزام بـ SLA' : 'SLA Adherence'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {agentPerf.map((agent) => (
                      <tr key={agent.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all">
                        <td className="py-4">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{language === 'ar' ? agent.nameAr : agent.nameEn}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{agent.department}</p>
                        </td>
                        <td className="py-4">
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{agent.resolvedCount}</span>
                        </td>
                        <td className="py-4">
                          <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">{agent.avgResponseTimeHours}h</span>
                        </td>
                        <td className="py-4">
                          <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">{agent.avgResolutionTimeHours}h</span>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden min-w-[60px]">
                              <div 
                                className={`h-full rounded-full ${agent.slaAdherenceRate >= 90 ? 'bg-success-green' : agent.slaAdherenceRate >= 70 ? 'bg-warning-amber' : 'bg-danger-red'}`}
                                style={{ width: `${agent.slaAdherenceRate}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{agent.slaAdherenceRate}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="premium-card p-6">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity size={18} className="text-primary-blue" />
                  {language === 'ar' ? 'النشاط الأخير' : 'Recent Activity'}
                </h3>
              </div>
              <div className="space-y-6">
                {recentActivity.map((log, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 shrink-0 overflow-hidden">
                      {log.user?.avatarUrl ? (
                        <img src={log.user.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : <Users size={20} />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-900 dark:text-white">
                        <span className="font-bold">{language === 'ar' ? log.user?.fullNameAr : log.user?.fullNameEn}</span>
                        {' '}{log.action}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {/* Export Controls */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {language === 'ar' ? 'من تاريخ' : 'From Date'}
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="date" 
                      value={exportStartDate}
                      onChange={(e) => setExportStartDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm outline-none focus:ring-2 focus:ring-primary-blue"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {language === 'ar' ? 'إلى تاريخ' : 'To Date'}
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="date" 
                      value={exportEndDate}
                      onChange={(e) => setExportEndDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm outline-none focus:ring-2 focus:ring-primary-blue"
                    />
                  </div>
                </div>
              </div>
              <button 
                onClick={handleExport}
                className="flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-primary-blue text-white font-bold hover:bg-blue-800 transition-all shadow-lg shadow-primary-blue/20"
              >
                <FileSpreadsheet size={20} />
                {language === 'ar' ? 'تصدير الآن' : 'Export Now'}
              </button>
            </div>
            <div className="mt-6 p-4 bg-warning-amber/5 border border-warning-amber/10 rounded-2xl flex items-center gap-3">
              <AlertCircle className="text-warning-amber" size={18} />
              <p className="text-xs text-warning-amber font-medium">
                {language === 'ar' 
                  ? 'ملاحظة: يتم حذف جميع التقارير المصدرة تلقائياً كل يوم الساعة 3:00 فجراً.' 
                  : 'Note: All exported reports are automatically deleted every day at 3:00 AM.'}
              </p>
            </div>
          </div>

          {/* Export History Table */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <History className="text-primary-blue" size={20} />
              <h3 className="font-bold text-slate-900 dark:text-white">
                {language === 'ar' ? 'سجل التقارير المصدرة' : 'Export History'}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{language === 'ar' ? 'اسم الملف' : 'File Name'}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{language === 'ar' ? 'الفترة' : 'Period'}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{language === 'ar' ? 'التذاكر' : 'Tickets'}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{language === 'ar' ? 'بواسطة' : 'Exported By'}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {exportHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm italic">
                        {language === 'ar' ? 'لا يوجد سجل تصدير متاح' : 'No export history available'}
                      </td>
                    </tr>
                  ) : exportHistory.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <FileSpreadsheet className="text-success-green" size={18} />
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{exp.fileName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-500">
                          {new Date(exp.dateFrom).toLocaleDateString()} - {new Date(exp.dateTo).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                          {exp.ticketCount}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {language === 'ar' ? exp.exportedBy.fullNameAr : exp.exportedBy.fullNameEn}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-400">{new Date(exp.createdAt).toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <a 
                          href={exp.fileUrl} 
                          download 
                          className="inline-flex items-center gap-2 text-primary-blue hover:underline text-xs font-bold uppercase tracking-widest"
                        >
                          <Download size={14} />
                          {language === 'ar' ? 'تحميل' : 'Download'}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
