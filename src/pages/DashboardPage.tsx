import { useState, useEffect } from 'react';
import ErrorBanner from '../components/ErrorBanner.tsx';
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
  slaBreaches: number;
  avgResolutionTimeHours: number;
  resolvedInternal: number;
  resolvedExternal: number;
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

interface AhtData {
  overallAhtHours: number;
  totalResolved: number;
  ahtByPriority: { priority: string; avgHours: number; count: number }[];
  ahtByDepartment: { departmentId: number; departmentName: string; avgHours: number; count: number }[];
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
  const [ahtData, setAhtData] = useState<AhtData | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [exportHistory, setExportHistory] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
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
      } catch (error: any) {
        if (isMounted) { setError(error?.message || 'Something went wrong'); console.error('Error fetching dashboard data:', error); }
      }
    };
    fetch();
    return () => {
      controller.abort();
      isMounted = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    const handleRefresh = () => setRefreshKey(k => k + 1);
    window.addEventListener('ws:ticket-created', handleRefresh);
    window.addEventListener('ws:ticket-status-updated', handleRefresh);
    window.addEventListener('ws:ticket-assigned', handleRefresh);
    return () => {
      window.removeEventListener('ws:ticket-created', handleRefresh);
      window.removeEventListener('ws:ticket-status-updated', handleRefresh);
      window.removeEventListener('ws:ticket-assigned', handleRefresh);
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
      setAssetSummary(data.assetSummary || null);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      setError(error?.message || 'Something went wrong');
      console.error('Error fetching dashboard data:', error);
    }

    try {
      const aht = await apiFetch('/api/analytics/aht', { signal });
      setAhtData(aht);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      setError(error?.message || 'Something went wrong');
      console.error('Error fetching AHT data:', error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const fetchExportHistory = async (signal?: AbortSignal) => {
    try {
      const res = await apiFetch('/api/analytics/exports', { signal });
      setExportHistory(Array.isArray(res) ? res : res.data);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      setError(error?.message || 'Something went wrong');
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
      setError(error?.message || 'Something went wrong');
      console.error('Export error:', error);
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  if (loading) return <div className="p-8 text-center text-[var(--text-muted)]">{t.loadingDashboard}</div>;

  return (
    <>
    <ErrorBanner error={error} onRetry={() => { setError(null); fetchDashboardData(); }} onDismiss={() => setError(null)} />
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-main)] mb-2">
            {t.welcome}, {user?.fullNameEn || user?.fullNameAr} 👋
          </h1>
          <p className="text-[var(--text-secondary)]">
            {t.todayActivity}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex premium-card p-1 shadow-sm">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'overview' ? 'bg-primary-blue text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-primary-blue'}`}
            >
              {t.overview}
            </button>
            <button 
              onClick={() => setActiveTab('exports')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'exports' ? 'bg-primary-blue text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-primary-blue'}`}
            >
              {t.exportHistory}
            </button>
          </div>
          <div className="flex items-center gap-3 premium-card p-2 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-primary-blue/10 flex items-center justify-center text-primary-blue">
              <Activity size={20} />
            </div>
            <div className="pr-4">
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.systemStatus}</p>
              <p className="text-sm font-bold text-[var(--color-success-green)]">{t.operational}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Knowledge Base Quick Search */}
      <div className="bg-gradient-to-r from-primary-blue to-blue-700 p-8 rounded-[2rem] shadow-xl shadow-primary-blue/20 text-white">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold mb-2">{t.kbHelpTitle}</h2>
          <p className="text-blue-100 mb-6">{t.kbSearchDesc}</p>
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300 group-focus-within:text-white transition-colors" size={20} />
            <input 
              type="text"
              placeholder={t.kbSearchPlaceholder}
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
              { label: t.totalTickets, value: stats?.total, icon: Ticket, color: 'text-primary-blue', bg: 'bg-primary-blue/10' },
              { label: t.pending, value: stats?.pending, icon: Clock, color: 'text-warning-amber', bg: 'bg-warning-amber/10' },
              { label: t.resolved, value: stats?.resolved, icon: CheckCircle2, color: 'text-success-green', bg: 'bg-success-green/10' },
              { label: t.overdue, value: stats?.overdue, icon: AlertCircle, color: 'text-danger-red', bg: 'bg-danger-red/10' },
              { label: t.avgResolution, value: `${stats?.avgResolutionTimeHours}h`, icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10' },
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
                <p className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">{kpi.label}</p>
                <h3 className="text-3xl font-bold text-[var(--text-main)]">{kpi.value}</h3>
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
              <div className="text-lg font-bold text-[var(--text-main)]">{t.newTicket}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">{t.newSupportTicket}</div>
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
              <div className="text-lg font-bold text-[var(--text-main)]">{t.teamFeed}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">{t.teamFeedDesc}</div>
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
              <div className="text-lg font-bold text-[var(--text-main)]">{t.knowledgeBase}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">{t.knowledgeBaseDesc}</div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Status Distribution */}
            <div className="lg:col-span-2 premium-card p-6">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2">
                  <Activity size={18} className="text-primary-blue" />
                  {t.statusDistribution}
                </h3>
                <select className="text-xs font-bold text-[var(--text-muted)] bg-transparent outline-none">
                  <option>Last 7 Days</option>
                  <option>{t.last30Days}</option>
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
              <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2 mb-8">
                <AlertCircle size={18} className="text-danger-red" />
                {t.priorityBreakdown}
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
                  <span className="text-2xl font-bold text-[var(--text-main)]">{stats?.total}</span>
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.total}</span>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {priorityDist.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-[var(--text-secondary)] capitalize font-medium">{p.priority}</span>
                    </div>
                    <span className="font-bold text-[var(--text-main)]">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Performance */}
            <div className="premium-card p-6">
              <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2 mb-8">
                <Building2 size={18} className="text-primary-blue" />
                {t.departmentTickets}
              </h3>
              <div className="space-y-6">
                {deptPerf.map((dept, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-[var(--text-secondary)]">
                        {language === 'ar' ? dept.nameAr : dept.nameEn}
                      </span>
                      <span className="text-sm font-bold text-[var(--text-main)]">{dept.count}</span>
                    </div>
                    <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
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

            {/* Resolution Type Breakdown */}
            <div className="premium-card p-6">
              <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2 mb-8">
                <CheckCircle2 size={18} className="text-success-green" />
                {t.resolutionType}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-success-green/5 border border-success-green/10">
                  <p className="text-[10px] font-bold text-success-green uppercase tracking-widest mb-1">{t.internal}</p>
                  <p className="text-2xl font-bold text-success-green">{stats?.resolvedInternal || 0}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    {stats && (stats.resolvedInternal + stats.resolvedExternal) > 0
                      ? `${Math.round((stats.resolvedInternal / (stats.resolvedInternal + stats.resolvedExternal)) * 100)}%`
                      : '0%'}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-warning-amber/5 border border-warning-amber/10">
                  <p className="text-[10px] font-bold text-warning-amber uppercase tracking-widest mb-1">{t.external}</p>
                  <p className="text-2xl font-bold text-warning-amber">{stats?.resolvedExternal || 0}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    {stats && (stats.resolvedInternal + stats.resolvedExternal) > 0
                      ? `${Math.round((stats.resolvedExternal / (stats.resolvedInternal + stats.resolvedExternal)) * 100)}%`
                      : '0%'}
                  </p>
                </div>
              </div>
              {(stats?.resolvedExternal || 0) > 0 && (
                <div className="mt-4 p-3 rounded-xl bg-warning-amber/5 border border-warning-amber/10 text-xs text-warning-amber font-medium">
                  {t.externalResources.replace('{count}', String(stats?.resolvedExternal || 0))}
                </div>
              )}
            </div>

            {/* AHT by Priority */}
            <div className="premium-card p-6">
              <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2 mb-8">
                <Clock size={18} className="text-primary-blue" />
                {t.ahtByPriority}
              </h3>
              {ahtData && ahtData.ahtByPriority.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-primary-blue/5 border border-primary-blue/10 mb-4">
                    <span className="text-sm font-bold text-[var(--text-secondary)]">
                      {t.overallAht}
                    </span>
                    <span className="text-lg font-bold text-primary-blue">{ahtData.overallAhtHours}h</span>
                  </div>
                  {ahtData.ahtByPriority.map((item, i) => {
                    const maxHours = Math.max(...ahtData.ahtByPriority.map(p => p.avgHours), 1);
                    const barPercent = (item.avgHours / maxHours) * 100;
                    const barColor = item.priority === 'high' || item.priority === 'critical' 
                      ? 'bg-danger-red' 
                      : item.priority === 'medium' 
                        ? 'bg-warning-amber' 
                        : 'bg-success-green';
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-[var(--text-secondary)] capitalize">{item.priority}</span>
                          <span className="text-xs font-bold text-[var(--text-main)]">{item.avgHours}h ({item.count})</span>
                        </div>
                        <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${barPercent}%` }}
                            className={`h-full rounded-full ${barColor}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-[var(--text-muted)] italic">
                  {t.notEnoughData}
                </div>
              )}
            </div>

            {/* Asset Summary */}
            <div className="premium-card p-6">
              <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2 mb-8">
                <Package size={18} className="text-primary-blue" />
                {t.assetSummary}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-[var(--border-dim)]/50 border border-[var(--border-dim)]">
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">{t.totalAssets}</p>
                  <p className="text-2xl font-bold text-[var(--text-main)]">{assetSummary?.total || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-success-green/5 border border-success-green/10">
                  <p className="text-[10px] font-bold text-success-green uppercase tracking-widest mb-1">{t.active}</p>
                  <p className="text-2xl font-bold text-success-green">{assetSummary?.active || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-warning-amber/5 border border-warning-amber/10">
                  <p className="text-[10px] font-bold text-warning-amber uppercase tracking-widest mb-1">{t.maintenance}</p>
                  <p className="text-2xl font-bold text-warning-amber">{assetSummary?.maintenance || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-danger-red/5 border border-danger-red/10">
                  <p className="text-[10px] font-bold text-danger-red uppercase tracking-widest mb-1">{t.retired}</p>
                  <p className="text-2xl font-bold text-danger-red">{assetSummary?.retired || 0}</p>
                </div>
              </div>
              <button 
                onClick={() => window.location.href = '/admin/assets'}
                className="w-full mt-6 py-3 rounded-xl border border-[var(--border-main)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--border-dim)] transition-all flex items-center justify-center gap-2"
              >
                {t.manageAssets}
                <ExternalLink size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Agent Performance Table */}
            <div className="lg:col-span-2 premium-card p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2">
                  <TrendingUp size={18} className="text-primary-blue" />
                  {t.agentPerformance}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-dim)]">
                      <th className="pb-4">{t.agent}</th>
                      <th className="pb-4">{t.resolved}</th>
                      <th className="pb-4">{t.avgResponse}</th>
                      <th className="pb-4">{t.avgResolution}</th>
                      <th className="pb-4">{t.slaAdherence}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-dim)]">
                    {agentPerf.map((agent) => (
                      <tr key={agent.id} className="group hover:bg-[var(--border-dim)] transition-all">
                        <td className="py-4">
                          <p className="text-sm font-bold text-[var(--text-main)]">{language === 'ar' ? agent.nameAr : agent.nameEn}</p>
                          <p className="text-[10px] text-[var(--text-secondary)] font-medium">{agent.department}</p>
                        </td>
                        <td className="py-4">
                          <span className="text-sm font-bold text-[var(--text-secondary)]">{agent.resolvedCount}</span>
                        </td>
                        <td className="py-4">
                          <span className="text-sm text-[var(--text-secondary)] font-medium">{agent.avgResponseTimeHours}h</span>
                        </td>
                        <td className="py-4">
                          <span className="text-sm text-[var(--text-secondary)] font-medium">{agent.avgResolutionTimeHours}h</span>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden min-w-[60px]">
                              <div 
                                className={`h-full rounded-full ${agent.slaAdherenceRate >= 90 ? 'bg-success-green' : agent.slaAdherenceRate >= 70 ? 'bg-warning-amber' : 'bg-danger-red'}`}
                                style={{ width: `${agent.slaAdherenceRate}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-[var(--text-main)]">{agent.slaAdherenceRate}%</span>
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
                <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2">
                  <Activity size={18} className="text-primary-blue" />
                  {t.recentActivity}
                </h3>
              </div>
              <div className="space-y-6">
                {recentActivity.map((log, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)] shrink-0 overflow-hidden">
                      {log.user?.avatarUrl ? (
                        <img src={log.user.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : <Users size={20} />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-[var(--text-main)]">
                        <span className="font-bold">{language === 'ar' ? log.user?.fullNameAr : log.user?.fullNameEn}</span>
                        {' '}{log.action}
                      </p>
                      <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-1">
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
          <div className="bg-[var(--bg-surface)] p-8 rounded-3xl border border-[var(--border-main)] shadow-sm">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                    {t.fromDate}
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
                    <input 
                      type="date" 
                      value={exportStartDate}
                      onChange={(e) => setExportStartDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] text-sm outline-none focus:ring-2 focus:ring-primary-blue"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                    {t.toDate}
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
                    <input 
                      type="date" 
                      value={exportEndDate}
                      onChange={(e) => setExportEndDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] text-sm outline-none focus:ring-2 focus:ring-primary-blue"
                    />
                  </div>
                </div>
              </div>
              <button 
                onClick={handleExport}
                className="flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-primary-blue text-white font-bold hover:bg-blue-800 transition-all shadow-lg shadow-primary-blue/20"
              >
                <FileSpreadsheet size={20} />
                {t.exportNow}
              </button>
            </div>
            <div className="mt-6 p-4 bg-warning-amber/5 border border-warning-amber/10 rounded-2xl flex items-center gap-3">
              <AlertCircle className="text-warning-amber" size={18} />
              <p className="text-xs text-warning-amber font-medium">
                {t.exportNote}
              </p>
            </div>
          </div>

          {/* Export History Table */}
          <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-main)] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-[var(--border-dim)] flex items-center gap-3">
              <History className="text-primary-blue" size={20} />
              <h3 className="font-bold text-[var(--text-main)]">
                {t.exportHistory}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--border-dim)]/50 border-b border-[var(--border-dim)]">
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.fileName}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.period}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.tickets}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.exportedBy}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.date}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-dim)]">
                  {exportHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-[var(--text-muted)] text-sm italic">
                        {t.noExportHistory}
                      </td>
                    </tr>
                  ) : exportHistory.map((exp) => (
                    <tr key={exp.id} className="hover:bg-[var(--border-dim)] transition-all">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <FileSpreadsheet className="text-success-green" size={18} />
                          <span className="text-sm font-bold text-[var(--text-main)]">{exp.fileName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-[var(--text-secondary)]">
                          {new Date(exp.dateFrom).toLocaleDateString()} - {new Date(exp.dateTo).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-lg bg-[var(--bg-elevated)] text-[10px] font-bold text-[var(--text-secondary)]">
                          {exp.ticketCount}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-[var(--text-secondary)]">
                          {language === 'ar' ? exp.exportedBy.fullNameAr : exp.exportedBy.fullNameEn}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-[var(--text-muted)]">{new Date(exp.createdAt).toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <a 
                          href={exp.fileUrl} 
                          download 
                          className="inline-flex items-center gap-2 text-primary-blue hover:underline text-xs font-bold uppercase tracking-widest"
                        >
                          <Download size={14} />
                          {t.download}
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
    </>
  );
}
