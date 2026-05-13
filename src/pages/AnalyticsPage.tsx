import React, { useState, useEffect } from 'react';
import { apiFetch } from '../core/api.ts';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Download,
  Calendar,
  Users,
  Award,
  Zap
} from 'lucide-react';
import { useAuthStore } from '../store/authStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { motion } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';

interface Stats {
  total: number;
  pending: number;
  resolved: number;
  open: number;
  overdue: number;
  avgResolutionTimeHours: number;
  resolvedInternal: number;
  resolvedExternal: number;
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

export const AnalyticsPage: React.FC = () => {
  const { accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, []);

  const fetchData = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      // Use consolidated summary where possible
      const data = await apiFetch('/api/analytics/dashboard-summary', { signal });
      if (data) {
        setStats(data.stats);
        setAgentPerformance(data.agentPerformance);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const statusData = stats ? [
    { name: 'Pending', value: stats.pending, color: '#f59e0b' },
    { name: 'Open', value: stats.open, color: '#3b82f6' },
    { name: 'Resolved', value: stats.resolved, color: '#10b981' },
    { name: 'Overdue', value: stats.overdue, color: '#ef4444' },
  ] : [];

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-3">
            <BarChart3 className="text-primary-blue" />
            {language === 'ar' ? 'التحليلات والتقارير' : 'Analytics & Reports'}
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {language === 'ar' ? 'متابعة أداء النظام ومؤشرات الإنجاز' : 'Monitor system performance and achievement indicators'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-xl text-sm font-medium hover:bg-[var(--bg-main)] transition-colors">
            <Calendar size={18} />
            {language === 'ar' ? 'آخر 30 يوم' : 'Last 30 Days'}
          </button>
          <button 
            onClick={() => window.open('/api/analytics/export', '_blank')}
            className="flex items-center gap-2 px-4 py-2 bg-primary-blue text-white rounded-xl text-sm font-bold hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20"
          >
            <Download size={18} />
            {language === 'ar' ? 'تصدير البيانات' : 'Export Data'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[var(--bg-surface)] p-6 rounded-3xl border border-[var(--border-main)] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl text-blue-600">
              <TrendingUp size={24} />
            </div>
            <span className="text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">+12%</span>
          </div>
          <div className="text-2xl font-bold text-[var(--text-main)]">{stats?.total || 0}</div>
          <div className="text-sm text-[var(--text-secondary)]">{language === 'ar' ? 'إجمالي التذاكر' : 'Total Tickets'}</div>
        </div>

        <div className="bg-[var(--bg-surface)] p-6 rounded-3xl border border-[var(--border-main)] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl text-amber-600">
              <Clock size={24} />
            </div>
          </div>
          <div className="text-2xl font-bold text-[var(--text-main)]">{stats?.avgResolutionTimeHours || 0}h</div>
          <div className="text-sm text-[var(--text-secondary)]">{language === 'ar' ? 'متوسط وقت الحل' : 'Avg Resolution Time'}</div>
        </div>

        <div className="bg-[var(--bg-surface)] p-6 rounded-3xl border border-[var(--border-main)] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl text-emerald-600">
              <CheckCircle2 size={24} />
            </div>
          </div>
          <div className="text-2xl font-bold text-[var(--text-main)]">{stats?.resolved || 0}</div>
          <div className="text-sm text-[var(--text-secondary)]">{language === 'ar' ? 'تم حلها' : 'Resolved Tickets'}</div>
        </div>

        <div className="bg-[var(--bg-surface)] p-6 rounded-3xl border border-[var(--border-main)] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-2xl text-rose-600">
              <AlertCircle size={24} />
            </div>
          </div>
          <div className="text-2xl font-bold text-[var(--text-main)]">{stats?.overdue || 0}</div>
          <div className="text-sm text-[var(--text-secondary)]">{language === 'ar' ? 'تجاوزت المهلة' : 'SLA Breached'}</div>
        </div>
      </div>

      {/* Resolution Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-surface)] p-6 rounded-3xl border border-success-green/20 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl text-emerald-600">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--text-main)]">{stats?.resolvedInternal || 0}</div>
              <div className="text-sm text-[var(--text-secondary)]">{language === 'ar' ? 'تم الحل داخلياً' : 'Resolved Internally'}</div>
            </div>
          </div>
          <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
            <div 
              className="h-full bg-success-green rounded-full"
              style={{ width: `${stats && (stats.resolvedInternal + stats.resolvedExternal) > 0 ? (stats.resolvedInternal / (stats.resolvedInternal + stats.resolvedExternal)) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] p-6 rounded-3xl border border-warning-amber/20 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl text-amber-600">
              <TrendingUp size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--text-main)]">{stats?.resolvedExternal || 0}</div>
              <div className="text-sm text-[var(--text-secondary)]">{language === 'ar' ? 'تم الحل خارجياً' : 'Resolved Externally'}</div>
            </div>
          </div>
          <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
            <div 
              className="h-full bg-warning-amber rounded-full"
              style={{ width: `${stats && (stats.resolvedInternal + stats.resolvedExternal) > 0 ? (stats.resolvedExternal / (stats.resolvedInternal + stats.resolvedExternal)) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Status Distribution */}
        <div className="lg:col-span-1 bg-[var(--bg-surface)] p-8 rounded-3xl border border-[var(--border-main)] shadow-sm">
          <h3 className="text-lg font-bold text-[var(--text-main)] mb-6">
            {language === 'ar' ? 'توزيع الحالات' : 'Status Distribution'}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6">
            {statusData.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                <span className="text-xs text-[var(--text-secondary)]">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Performance Table */}
        <div className="lg:col-span-2 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-main)] shadow-sm overflow-hidden">
          <div className="p-8 border-b border-[var(--border-dim)] flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--text-main)] flex items-center gap-2">
              <Award className="text-amber-500" />
              {language === 'ar' ? 'أداء الوكلاء' : 'Agent Performance'}
            </h3>
            <button className="text-sm text-primary-blue font-bold hover:underline">
              {language === 'ar' ? 'عرض الكل' : 'View All'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--border-dim)]/50 text-[var(--text-secondary)] text-[10px] uppercase tracking-wider">
                  <th className="px-8 py-4 font-bold">{language === 'ar' ? 'الوكيل' : 'Agent'}</th>
                  <th className="px-8 py-4 font-bold">{language === 'ar' ? 'تم حلها' : 'Resolved'}</th>
                  <th className="px-8 py-4 font-bold">{language === 'ar' ? 'متوسط الاستجابة' : 'Avg Response'}</th>
                  <th className="px-8 py-4 font-bold">{language === 'ar' ? 'متوسط الحل' : 'Avg Resolution'}</th>
                  <th className="px-8 py-4 font-bold">{language === 'ar' ? 'الالتزام بـ SLA' : 'SLA Adherence'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-dim)]">
                {agentPerformance.slice(0, 5).map((agent) => (
                  <tr key={agent.id} className="hover:bg-[var(--border-dim)]/50 transition-colors">
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-xs font-bold text-primary-blue">
                          {agent.nameEn.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-[var(--text-main)]">
                            {language === 'ar' ? agent.nameAr : agent.nameEn}
                          </div>
                          <div className="text-[10px] text-[var(--text-secondary)]">{agent.department}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2">
                        <Zap size={14} className="text-amber-500" />
                        <span className="text-sm font-bold text-[var(--text-secondary)]">{agent.resolvedCount}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-sm text-[var(--text-secondary)]">
                      {agent.avgResponseTimeHours}h
                    </td>
                    <td className="px-8 py-4 text-sm text-[var(--text-secondary)]">
                      {agent.avgResolutionTimeHours}h
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              agent.slaAdherenceRate > 90 ? 'bg-emerald-500' : 
                              agent.slaAdherenceRate > 70 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${agent.slaAdherenceRate}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-bold text-[var(--text-secondary)]">{agent.slaAdherenceRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
