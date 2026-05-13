import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { 
  Search, 
  Filter, 
  Calendar, 
  User as UserIcon, 
  FileText, 
  ChevronLeft, 
  ChevronRight,
  Info,
  X,
  ArrowRightLeft,
  ShieldAlert,
  Archive,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuditLog {
  id: number;
  userId: number;
  action: string;
  departmentId?: number;
  ticketId?: number;
  oldData: any;
  newData: any;
  createdAt: string;
  user: {
    fullNameAr: string;
    fullNameEn: string;
    username: string;
    badgeNumber: string;
  };
  department?: {
    nameAr: string;
    nameEn: string;
  };
  ticket?: {
    ticketNumber: string;
    subject: string;
  };
}

export default function AuditLogPage() {
  const { accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filters
  const [filters, setFilters] = useState({
    userId: '',
    action: '',
    startDate: '',
    endDate: '',
    ticketId: ''
  });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchLogs(controller.signal);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, filters]);

  const fetchLogs = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: '15',
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
      }).toString();

      const res = await fetch(`/api/audit?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Error fetching logs:', error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('DELETE')) return 'text-danger-red bg-danger-red/10';
    if (action.includes('CREATE')) return 'text-success-green bg-success-green/10';
    if (action.includes('UPDATE')) return 'text-primary-blue bg-primary-blue/10';
    if (action.includes('ARCHIVE')) return 'text-warning-amber bg-warning-amber/10';
    return 'text-[var(--text-secondary)] bg-[var(--bg-elevated)]';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">
            {language === 'ar' ? 'سجلات التدقيق' : 'Audit Logs'}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {language === 'ar' ? 'مراقبة جميع تحركات النظام والتغييرات' : 'Monitor all system actions and data changes'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
            <input 
              type="text"
              placeholder={language === 'ar' ? 'البحث تذكرة ID...' : 'Ticket ID...'}
              value={filters.ticketId}
              onChange={(e) => setFilters({...filters, ticketId: e.target.value})}
              className="pl-10 pr-4 py-2 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-blue transition-all"
            />
          </div>
          <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-xl px-3 py-2">
            <Calendar size={16} className="text-[var(--text-muted)]" />
            <input 
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              className="bg-transparent border-none text-xs outline-none text-white"
            />
            <span className="text-[var(--text-muted)]">-</span>
            <input 
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              className="bg-transparent border-none text-xs outline-none text-white"
            />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-main)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--border-dim)] border-b border-[var(--border-dim)]">
                <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{language === 'ar' ? 'المستخدم' : 'User'}</th>
                <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{language === 'ar' ? 'الإجراء' : 'Action'}</th>
                <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{language === 'ar' ? 'التفاصيل' : 'Details'}</th>
                <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-dim)]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-4 h-16">
                      <div className="h-4 bg-[var(--bg-elevated)] rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--border-dim)]/50 transition-all">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                          <UserIcon size={14} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[var(--text-main)]">
                            {language === 'ar' ? log.user.fullNameAr : log.user.fullNameEn}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] font-medium">#{log.user.badgeNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${getActionColor(log.action)}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {log.ticket ? (
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-bold text-primary-blue bg-primary-blue/5 px-1.5 py-0.5 rounded border border-primary-blue/10">
                            {log.ticket.ticketNumber}
                          </label>
                          <span className="text-xs text-[var(--text-secondary)] truncate max-w-[200px]">{log.ticket.subject}</span>
                        </div>
                      ) : log.department ? (
                        <span className="text-xs text-[var(--text-secondary)] italic">
                          {language === 'ar' ? log.department.nameAr : log.department.nameEn}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)] font-medium italic">System Wide Action</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-xs font-medium text-[var(--text-secondary)]">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setSelectedLog(log)}
                        className="p-2 text-[var(--text-muted)] hover:text-primary-blue transition-all"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-[var(--text-muted)]">
                    No logs found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-[var(--border-dim)] flex items-center justify-between border-t border-[var(--border-dim)]">
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="p-2 border border-[var(--border-main)] rounded-lg text-[var(--text-secondary)] disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <button 
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="p-2 border border-[var(--border-main)] rounded-lg text-[var(--text-secondary)] disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Log Detail Modal */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[var(--bg-surface)] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-[var(--border-dim)] flex items-center justify-between bg-[var(--border-dim)]">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${getActionColor(selectedLog.action)}`}>
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[var(--text-main)] uppercase tracking-wider">{selectedLog.action.replace(/_/g, ' ')}</h3>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">ID: {selectedLog.id} • {new Date(selectedLog.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedLog(null)}
                  className="p-2 hover:bg-[var(--bg-elevated)] rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-dim)]">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">User Performance</p>
                    <p className="text-sm font-bold text-[var(--text-main)]">{selectedLog.user.fullNameEn}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{selectedLog.user.badgeNumber}</p>
                  </div>
                  {selectedLog.ticket && (
                    <div className="p-4 rounded-2xl bg-primary-blue/5 border border-primary-blue/10">
                      <p className="text-[10px] font-bold text-primary-blue uppercase tracking-widest mb-2">Related Ticket</p>
                      <p className="text-sm font-bold text-[var(--text-main)]">{selectedLog.ticket.ticketNumber}</p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">{selectedLog.ticket.subject}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Changes Data Comparison</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-danger-red uppercase tracking-widest px-2 py-0.5 bg-danger-red/5 rounded">Previous State</span>
                        <pre className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-dim)] text-[10px] text-[var(--text-secondary)] font-mono overflow-auto max-h-40 whitespace-pre-wrap">
                          {selectedLog.oldData ? JSON.stringify(selectedLog.oldData, null, 2) : 'No previous data'}
                        </pre>
                      </div>
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-success-green uppercase tracking-widest px-2 py-0.5 bg-success-green/5 rounded">Updated State</span>
                        <pre className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-dim)] text-[10px] text-[var(--text-secondary)] font-mono overflow-auto max-h-40 whitespace-pre-wrap">
                          {selectedLog.newData ? JSON.stringify(selectedLog.newData, null, 2) : 'No updated data'}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-[var(--border-dim)] border-t border-[var(--border-dim)] flex justify-end">
                <button 
                  onClick={() => setSelectedLog(null)}
                  className="px-8 py-2.5 bg-[var(--bg-elevated)] text-[var(--text-main)] rounded-xl font-bold text-sm shadow-xl shadow-slate-900/10 transition-all hover:scale-105"
                >
                  Dismiss Detail
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
