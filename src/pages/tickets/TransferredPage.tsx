import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore.ts';
import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { apiFetch } from '../../core/api.ts';
import ErrorBanner from '../../components/ErrorBanner.tsx';
import { Search, RefreshCw, ArrowUpDown } from 'lucide-react';

interface Ticket {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  creatorName: string;
  ticketType?: { nameAr: string; nameEn: string; color: string };
  assignedTo?: { fullNameAr: string; fullNameEn: string };
  transfers?: {
    fromDepartment: { nameAr: string; nameEn: string };
    toDepartment: { nameAr: string; nameEn: string };
    transferredBy: { fullNameEn: string; fullNameAr: string };
    createdAt: string;
  }[];
}

export default function TransferredPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, pages: 1 });

  const { user } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  const fetchTickets = async (page = 1, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (searchTerm) params.set('search', searchTerm);
      const data = await apiFetch(`/api/tickets/transferred?${params}`, { signal });
      if (signal?.aborted) return;
      setTickets(data.tickets);
      setPagination(data.pagination);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err?.message || 'Something went wrong');
      console.error('Failed to fetch transferred tickets:', err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchTickets(1, controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => fetchTickets(1, controller.signal), 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [searchTerm]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const controller = new AbortController();
    fetchTickets(1, controller.signal);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig?.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    const sorted = [...tickets].sort((a: any, b: any) => {
      if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    setTickets(sorted);
  };

  const statusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      in_progress: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
      resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      closed: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
    };
    return colors[status] || 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]';
  };

  const priorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
      normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return colors[priority] || 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]';
  };

  return (
    <div className="p-6">
      <ErrorBanner error={error} onRetry={() => { setError(null); fetchTickets?.(pagination.page); }} onDismiss={() => setError(null)} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-main)]">
          {language === 'ar' ? 'التذاكر المحولة' : 'Transferred Tickets'}
        </h1>
        <button
          onClick={() => fetchTickets(pagination.page)}
          className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
        >
          <RefreshCw size={20} className="text-[var(--text-secondary)]" />
        </button>
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={language === 'ar' ? 'بحث في التذاكر المحولة...' : 'Search transferred tickets...'}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </form>

      <div className="bg-[var(--bg-surface)] rounded-xl shadow-sm border border-[var(--border-main)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-main)] bg-[var(--border-dim)]/50">
                <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider cursor-pointer" onClick={() => handleSort('ticketNumber')}>
                  <span className="flex items-center gap-1">{language === 'ar' ? 'رقم التذكرة' : 'Ticket #'} <ArrowUpDown size={14} /></span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider cursor-pointer" onClick={() => handleSort('subject')}>
                  <span className="flex items-center gap-1">{t.subject} <ArrowUpDown size={14} /></span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{language === 'ar' ? 'من قسم' : 'From Dept'}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t.priority}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{language === 'ar' ? 'تاريخ التحويل' : 'Transferred At'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-dim)]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[var(--text-muted)]">
                    {language === 'ar' ? 'جاري التحميل...' : 'Loading...'}
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[var(--text-muted)]">
                    {language === 'ar' ? 'لا توجد تذاكر محولة' : 'No transferred tickets'}
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="hover:bg-[var(--border-dim)] cursor-pointer transition-colors"
                    onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: `/tickets/${ticket.id}` }))}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-blue-600 dark:text-blue-400">
                      {ticket.ticketNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-main)] max-w-xs truncate">
                      {ticket.subject || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                      {ticket.transfers?.[0]
                        ? (language === 'ar' ? ticket.transfers[0].fromDepartment.nameAr : ticket.transfers[0].fromDepartment.nameEn)
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(ticket.status)}`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColor(ticket.priority)}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                      {ticket.transfers?.[0]
                        ? new Date(ticket.transfers[0].createdAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-GB')
                        : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => fetchTickets(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                p === pagination.page
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
