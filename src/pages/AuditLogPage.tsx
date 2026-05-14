import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../store/settingsStore.ts';
import { translations } from '../core/translations.ts';
import { 
  Search, 
  Calendar, 
  User as UserIcon, 
  FileText, 
  ChevronLeft, 
  ChevronRight,
  X,
  ArrowRightLeft,
  ShieldAlert,
  Eye,
  ChevronDown,
  ChevronUp,
  Monitor,
  Globe,
  Fingerprint,
  Box,
  AlertTriangle,
  Archive
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../core/api.ts';

interface AuditLog {
  id: number;
  userId: number;
  action: string;
  entityType?: string;
  entityId?: number;
  departmentId?: number;
  ticketId?: number;
  ipAddress?: string;
  userAgent?: string;
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
  const { language } = useSettingsStore();
  const t = translations[language];
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [actionList, setActionList] = useState<string[]>([]);

  const [filters, setFilters] = useState({
    userId: '',
    action: '',
    startDate: '',
    endDate: '',
    ticketId: ''
  });
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    apiFetch('/api/audit/actions')
      .then(data => setActionList(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '15',
      });
      if (actionFilter) params.set('action', actionFilter);
      if (filters.ticketId) params.set('ticketId', filters.ticketId);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);

      const data = await apiFetch(`/api/audit?${params.toString()}`, { signal });
      if (signal?.aborted) return;
      setLogs(data.logs || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setError(t.errorFetchingLogs);
      console.error('Error fetching logs:', err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, actionFilter, filters]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => fetchLogs(controller.signal), 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchLogs]);

  const getActionColor = (action: string) => {
    if (action.includes('DELETE')) return 'text-danger-red bg-danger-red/10 border-danger-red/10';
    if (action.includes('CREATE')) return 'text-success-green bg-success-green/10 border-success-green/10';
    if (action.includes('UPDATE')) return 'text-primary-blue bg-primary-blue/10 border-primary-blue/10';
    if (action.includes('ARCHIVE')) return 'text-warning-amber bg-warning-amber/10 border-warning-amber/10';
    if (action.includes('LOGIN') || action.includes('LOGOUT')) return 'text-indigo-500 bg-indigo-500/10 border-indigo-500/10';
    return 'text-[var(--text-secondary)] bg-[var(--bg-elevated)] border-[var(--border-dim)]';
  };

  const getActionIcon = (action: string) => {
    if (action.includes('DELETE') || action.includes('ARCHIVE')) return <Archive size={16} />;
    if (action.includes('CREATE')) return <FileText size={16} />;
    if (action.includes('LOGIN') || action.includes('LOGOUT')) return <ShieldAlert size={16} />;
    return <ArrowRightLeft size={16} />;
  };

  const getActionLabel = (action: string): string => {
    const map: Record<string, string> = {
      TICKET_CREATED: t.ticketCreated,
      TICKET_UPDATED: t.ticketUpdated,
      TICKET_DELETED: t.ticketDeleted,
      STATUS_CHANGED: t.statusChanged,
      ASSIGNED: t.assigned,
      TRANSFERRED: t.transferred,
      ARTICLE_CREATED: t.articleCreated,
      ARTICLE_UPDATED: t.articleUpdated,
      ARTICLE_DELETED: t.articleDeleted,
      USER_CREATED: t.userCreated,
      USER_UPDATED: t.userUpdated,
      USER_DELETED: t.userDeleted,
      COMMENT_CREATED: t.commentCreated,
      FILE_UPLOADED: t.fileUploaded,
      DEPARTMENT_CREATED: t.departmentCreated,
      DEPARTMENT_UPDATED: t.departmentUpdated,
      DEPARTMENT_DELETED: t.departmentDeleted,
      LOGIN: t.login,
      LOGOUT: t.logout,
    };
    return map[action] || action.replace(/_/g, ' ');
  };

  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  const renderDataChanges = (oldData: any, newData: any) => {
    if (!oldData && !newData) return null;

    const allKeys = [...new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})])];
    const changes: { key: string; old: string; new: string }[] = [];

    for (const key of allKeys) {
      const oldVal = oldData?.[key];
      const newVal = newData?.[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          key,
          old: formatValue(oldVal),
          new: formatValue(newVal),
        });
      }
    }

    if (changes.length === 0) return <p className="text-xs text-[var(--text-muted)] italic">{t.noChanges}</p>;

    return (
      <div className="space-y-2">
        {changes.map((c) => (
          <div key={c.key} className="grid grid-cols-[120px_1fr_auto_1fr] gap-2 items-center text-xs">
            <span className="font-bold text-[var(--text-main)] capitalize truncate">{c.key}</span>
            <span className="text-danger-red line-through truncate bg-danger-red/5 px-2 py-1 rounded">{c.old}</span>
            <ArrowRightLeft size={12} className="text-[var(--text-muted)] shrink-0" />
            <span className="text-success-green truncate bg-success-green/5 px-2 py-1 rounded">{c.new}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-3">
            <ShieldAlert className="text-primary-blue" size={28} />
            {t.auditLogs}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t.auditLogsDesc}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-blue transition-all"
          >
            <option value="">{t.allActions}</option>
            {actionList.map(a => (
              <option key={a} value={a}>{getActionLabel(a)}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
            <input 
              type="text"
              placeholder={t.searchTicketId}
              value={filters.ticketId}
              onChange={(e) => setFilters({...filters, ticketId: e.target.value})}
              className="pl-10 pr-4 py-2 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-blue transition-all w-40"
            />
          </div>
          <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-xl px-3 py-2">
            <Calendar size={16} className="text-[var(--text-muted)] shrink-0" />
            <input 
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              className="bg-transparent border-none text-xs outline-none text-[var(--text-main)] w-28"
            />
            <span className="text-[var(--text-muted)]">-</span>
            <input 
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              className="bg-transparent border-none text-xs outline-none text-[var(--text-main)] w-28"
            />
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-danger-red/5 border border-danger-red/10 text-danger-red">
          <AlertTriangle size={20} />
          <span className="text-sm font-bold">{error}</span>
          <button onClick={() => { setError(null); fetchLogs(); }} className="ml-auto text-xs font-bold underline">
            {t.retry}
          </button>
        </div>
      )}

      {/* Stats Bar */}
      {!loading && logs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: t.totalEntries, value: logs.length, color: 'text-primary-blue' },
            { label: t.uniqueActions, value: new Set(logs.map(l => l.action)).size, color: 'text-success-green' },
            { label: t.uniqueUsers, value: new Set(logs.map(l => l.userId)).size, color: 'text-warning-amber' },
            { label: t.uniqueTickets, value: new Set(logs.filter(l => l.ticketId).map(l => l.ticketId)).size, color: 'text-rose-500' },
          ].map((stat, i) => (
            <div key={i} className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] p-4">
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-main)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--border-dim)] border-b border-[var(--border-dim)]">
                <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.userLabel}</th>
                <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.action}</th>
                <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.entity}</th>
                <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.date}</th>
                <th className="px-6 py-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest text-right">{t.preview}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-dim)]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-5">
                      <div className="h-5 bg-[var(--bg-elevated)] rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--border-dim)]/50 transition-all">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-blue/10 flex items-center justify-center text-primary-blue shrink-0">
                          <UserIcon size={15} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[var(--text-main)]">
                            {language === 'ar' ? log.user.fullNameAr : log.user.fullNameEn}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] font-mono">#{log.user.badgeNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${getActionColor(log.action)}`}>
                        {getActionIcon(log.action)}
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {log.ticket ? (
                          <span className="text-[10px] font-bold font-mono text-primary-blue bg-primary-blue/5 px-2 py-1 rounded border border-primary-blue/10">
                            {log.ticket.ticketNumber}
                          </span>
                        ) : log.department ? (
                          <span className="text-xs text-[var(--text-secondary)] italic">
                            {language === 'ar' ? log.department.nameAr : log.department.nameEn}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)] font-medium italic">{t.systemWideAction}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-xs font-medium text-[var(--text-secondary)]">
                        {new Date(log.createdAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => {
                          setSelectedLog(log);
                          setShowRawJson(false);
                        }}
                        className="p-2 rounded-xl text-[var(--text-muted)] hover:text-primary-blue hover:bg-primary-blue/5 transition-all"
                        title={t.viewDetails}
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
                      <ShieldAlert size={40} className="opacity-30" />
                      <p className="text-sm font-medium">{t.noLogsFound}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-[var(--border-dim)] flex items-center justify-between border-t border-[var(--border-dim)]">
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
            {t.pageOf.replace('{page}', String(page)).replace('{totalPages}', String(totalPages))}
          </p>
          <div className="flex items-center gap-2">
            <button 
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-2 border border-[var(--border-main)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={18} className={language === 'ar' ? 'rotate-180' : ''} />
            </button>
            <span className="text-xs font-bold text-[var(--text-muted)] px-2">{page}</span>
            <button 
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="p-2 border border-[var(--border-main)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 transition-all"
            >
              <ChevronRight size={18} className={language === 'ar' ? 'rotate-180' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Log Detail Modal */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[var(--bg-surface)] w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="px-8 py-6 border-b border-[var(--border-dim)] flex items-center justify-between bg-[var(--border-dim)] shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${getActionColor(selectedLog.action)}`}>
                    <ShieldAlert size={22} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[var(--text-main)]">{getActionLabel(selectedLog.action)}</h3>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                      ID: {selectedLog.id} • {new Date(selectedLog.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedLog(null)}
                  className="p-2 hover:bg-[var(--bg-elevated)] rounded-xl transition-all text-[var(--text-muted)] hover:text-[var(--text-main)]"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-8 space-y-6 overflow-y-auto">
                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-dim)]">
                    <div className="flex items-center gap-2 mb-3">
                      <UserIcon size={14} className="text-[var(--text-muted)]" />
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.userLabel}</span>
                    </div>
                    <p className="text-sm font-bold text-[var(--text-main)]">
                      {language === 'ar' ? selectedLog.user.fullNameAr : selectedLog.user.fullNameEn}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
                      {selectedLog.user.badgeNumber} • @{selectedLog.user.username}
                    </p>
                    {selectedLog.department && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {language === 'ar' ? selectedLog.department.nameAr : selectedLog.department.nameEn}
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-dim)]">
                    <div className="flex items-center gap-2 mb-3">
                      <Box size={14} className="text-[var(--text-muted)]" />
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.entity}</span>
                    </div>
                    {selectedLog.ticket ? (
                      <>
                        <p className="text-sm font-bold text-primary-blue">{selectedLog.ticket.ticketNumber}</p>
                        <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{selectedLog.ticket.subject}</p>
                      </>
                    ) : selectedLog.entityType ? (
                      <>
                        <p className="text-sm font-bold text-[var(--text-main)]">{selectedLog.entityType}</p>
                        {selectedLog.entityId && (
                          <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">ID: {selectedLog.entityId}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)] italic">{t.systemWideAction}</p>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-dim)]">
                    <div className="flex items-center gap-2 mb-3">
                      <Globe size={14} className="text-[var(--text-muted)]" />
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.metadata}</span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <Monitor size={12} className="text-[var(--text-muted)] shrink-0" />
                        <span className="text-[var(--text-secondary)] truncate" title={selectedLog.userAgent || ''}>
                          {selectedLog.userAgent ? selectedLog.userAgent.split(' ')[0] : '-'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Fingerprint size={12} className="text-[var(--text-muted)] shrink-0" />
                        <span className="text-[var(--text-secondary)] font-mono">{selectedLog.ipAddress || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Data Changes */}
                {(selectedLog.oldData || selectedLog.newData) ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">{t.changesDataComparison}</h4>
                      <div className="p-5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-dim)]">
                        {renderDataChanges(selectedLog.oldData, selectedLog.newData)}
                      </div>
                    </div>

                    <div>
                      <button
                        onClick={() => setShowRawJson(!showRawJson)}
                        className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] hover:text-primary-blue transition-all"
                      >
                        {showRawJson ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {showRawJson ? t.hideRawJson : t.showRawJson}
                      </button>
                      {showRawJson && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                          <div className="space-y-2">
                            <span className="inline-block text-[10px] font-bold text-danger-red uppercase tracking-widest px-2 py-0.5 bg-danger-red/5 rounded">{t.previousState}</span>
                            <pre className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-dim)] text-[10px] text-[var(--text-secondary)] font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                              {selectedLog.oldData ? JSON.stringify(selectedLog.oldData, null, 2) : t.noPreviousData}
                            </pre>
                          </div>
                          <div className="space-y-2">
                            <span className="inline-block text-[10px] font-bold text-success-green uppercase tracking-widest px-2 py-0.5 bg-success-green/5 rounded">{t.updatedState}</span>
                            <pre className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-dim)] text-[10px] text-[var(--text-secondary)] font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                              {selectedLog.newData ? JSON.stringify(selectedLog.newData, null, 2) : t.noUpdatedData}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-dim)]">
                    <p className="text-xs text-[var(--text-muted)] italic">{t.noChanges}</p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 bg-[var(--border-dim)] border-t border-[var(--border-dim)] flex justify-end shrink-0">
                <button 
                  onClick={() => setSelectedLog(null)}
                  className="px-8 py-2.5 bg-[var(--bg-elevated)] text-[var(--text-main)] rounded-xl font-bold text-sm shadow-lg transition-all hover:scale-105"
                >
                  {t.dismissDetail}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
