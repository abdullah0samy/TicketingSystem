import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../store/authStore.ts';
import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { apiFetch } from '../../core/api.ts';
import ErrorBanner from '../../components/ErrorBanner.tsx';
import { 
  Send, 
  Search, 
  Clock, 
  Tag, 
  ChevronRight, 
  AlertCircle, 
  Inbox,
  Columns,
  ChevronDown,
  ChevronLeft,
  ArrowUpDown,
  List,
  LayoutGrid,
  CheckSquare,
  Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Ticket {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  department?: { nameAr: string; nameEn: string };
  ticketType?: { nameAr: string; nameEn: string; color: string };
}

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['ticketNumber', 'subject', 'priority', 'status', 'date']);
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const { accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  const fetchTickets = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(pageSize) });
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      const data = await apiFetch(`/api/tickets/my?${params.toString()}`, { signal });
      setTickets(data.tickets);
      setTotalPages(data.pagination.pages);
      setTotalCount(data.pagination.total);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      setError(error?.message || 'Something went wrong');
      console.error('Error fetching tickets:', error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (isMounted) {
        fetchTickets(controller.signal);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
      isMounted = false;
    };
  }, [currentPage, searchTerm]);

  // Client-side sorting on the current page of results
  const filteredTickets = tickets;

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedTickets = useMemo(() => {
    if (!sortConfig) return filteredTickets;
    return [...filteredTickets].sort((a: any, b: any) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredTickets, sortConfig]);

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const columns = [
    { id: 'ticketNumber', label: language === 'ar' ? 'رقم التذكرة' : 'Ticket #' },
    { id: 'subject', label: language === 'ar' ? 'الموضوع' : 'Subject' },
    { id: 'priority', label: language === 'ar' ? 'الأولوية' : 'Priority' },
    { id: 'status', label: language === 'ar' ? 'الحالة' : 'Status' },
    { id: 'date', label: language === 'ar' ? 'التاريخ' : 'Date' },
    { id: 'department', label: language === 'ar' ? 'القسم' : 'Department' },
  ];

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return language === 'ar' ? 'قيد الانتظار' : 'Pending';
      case 'open': return language === 'ar' ? 'مفتوحة' : 'Open';
      case 'in_progress': return language === 'ar' ? 'قيد التنفيذ' : 'In Progress';
      case 'resolved': return language === 'ar' ? 'تم الحل' : 'Resolved';
      case 'closed': return language === 'ar' ? 'مغلقة' : 'Closed';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} onRetry={() => { setError(null); fetchTickets?.(); }} onDismiss={() => setError(null)} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-3">
            <Send className="text-primary-blue" />
            {language === 'ar' ? 'تذاكري الصادرة' : 'My Outgoing Tickets'}
          </h2>
          <p className="text-[var(--text-secondary)]">
            {language === 'ar' ? 'تتبع حالة التذاكر التي قمت بإنشائها' : 'Track the status of tickets you created'}
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
            <input
              type="text"
              placeholder={t.search}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-sm outline-none focus:ring-2 focus:ring-primary-blue w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-xl p-1">
              <button 
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-primary-blue text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >
                <List size={18} />
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-primary-blue text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >
                <LayoutGrid size={18} />
              </button>
            </div>

            <div className="relative">
              <button 
                onClick={() => setShowColumnToggle(!showColumnToggle)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-main)] transition-all"
              >
                <Columns size={18} />
                <span>{language === 'ar' ? 'الأعمدة' : 'Columns'}</span>
                <ChevronDown size={14} className={`transition-transform ${showColumnToggle ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showColumnToggle && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-48 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-2xl shadow-xl z-50 p-4 space-y-2"
                  >
                    {columns.map(col => (
                      <label key={col.id} className="flex items-center gap-3 cursor-pointer group">
                        <div 
                          onClick={() => toggleColumn(col.id)}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                            visibleColumns.includes(col.id) ? 'bg-primary-blue border-primary-blue text-white' : 'border-[var(--border-main)]'
                          }`}
                        >
                          {visibleColumns.includes(col.id) && <CheckSquare size={14} />}
                        </div>
                        <span className="text-xs font-bold text-[var(--text-secondary)] group-hover:text-primary-blue transition-all">{col.label}</span>
                      </label>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-[var(--bg-elevated)] animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : sortedTickets.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] p-12 text-center">
          <div className="w-16 h-16 bg-[var(--border-dim)] rounded-full flex items-center justify-center mx-auto mb-4 text-[var(--text-muted)]">
            <Inbox size={32} />
          </div>
          <h3 className="text-lg font-bold text-[var(--text-main)] mb-1">
            {language === 'ar' ? 'لا توجد تذاكر' : 'No tickets found'}
          </h3>
          <p className="text-[var(--text-secondary)] mb-6">
            {language === 'ar' ? 'لم تقم بإنشاء أي تذاكر بعد' : "You haven't created any tickets yet"}
          </p>
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: '/tickets/new' }))}
            className="bg-primary-blue text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-800 transition-all"
          >
            {language === 'ar' ? 'فتح تذكرة جديدة' : 'Open New Ticket'}
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-main)] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--border-dim)]/50 border-b border-[var(--border-dim)]">
                  {visibleColumns.includes('ticketNumber') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('ticketNumber')}>
                      <div className="flex items-center gap-1">
                        {language === 'ar' ? 'رقم التذكرة' : 'Ticket #'}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('subject') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('subject')}>
                      <div className="flex items-center gap-1">
                        {language === 'ar' ? 'الموضوع' : 'Subject'}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('priority') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('priority')}>
                      <div className="flex items-center gap-1">
                        {language === 'ar' ? 'الأولوية' : 'Priority'}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('status') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-1">
                        {language === 'ar' ? 'الحالة' : 'Status'}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('date') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('createdAt')}>
                      <div className="flex items-center gap-1">
                        {language === 'ar' ? 'التاريخ' : 'Date'}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('department') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                      {language === 'ar' ? 'القسم' : 'Department'}
                    </th>
                  )}
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-dim)]">
                {sortedTickets.map((ticket) => (
                  <tr 
                    key={ticket.id} 
                    className="hover:bg-[var(--bg-main)] transition-all cursor-pointer group"
                    onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: `/tickets/${ticket.id}` }))}
                  >
                    {visibleColumns.includes('ticketNumber') && (
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs font-bold text-primary-blue bg-primary-blue/5 px-2 py-1 rounded-lg">{ticket.ticketNumber}</span>
                      </td>
                    )}
                    {visibleColumns.includes('subject') && (
                      <td className="px-6 py-4">
                        <span className="font-bold text-[var(--text-main)] line-clamp-1 group-hover:text-primary-blue transition-all">{ticket.subject}</span>
                      </td>
                    )}
                    {visibleColumns.includes('priority') && (
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${
                          ticket.priority === 'critical' ? 'bg-danger-red/10 text-danger-red' : 
                          ticket.priority === 'high' ? 'bg-warning-amber/10 text-warning-amber' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                        }`}>
                          {ticket.priority}
                        </span>
                      </td>
                    )}
                    {visibleColumns.includes('status') && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            ticket.status === 'resolved' ? 'bg-success-green' : 
                            ticket.status === 'pending' ? 'bg-warning-amber' : 'bg-primary-blue'
                          }`} />
                          <span className={`text-xs font-bold uppercase tracking-widest ${
                            ticket.status === 'resolved' ? 'text-success-green' : 
                            ticket.status === 'pending' ? 'text-warning-amber' : 'text-primary-blue'
                          }`}>
                            {getStatusLabel(ticket.status)}
                          </span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('date') && (
                      <td className="px-6 py-4 text-xs text-[var(--text-secondary)]">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </td>
                    )}
                    {visibleColumns.includes('department') && (
                      <td className="px-6 py-4 text-xs text-[var(--text-secondary)]">
                        {language === 'ar' ? ticket.department?.nameAr : ticket.department?.nameEn}
                      </td>
                    )}
                    <td className="px-6 py-4 text-right">
                      <ChevronRight className="text-[var(--text-muted)] group-hover:text-primary-blue transition-all" size={20} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedTickets.map((ticket) => (
            <motion.div
              layout
              key={ticket.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4 }}
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: `/tickets/${ticket.id}` }))}
              className="bg-[var(--bg-surface)]/50 dark:backdrop-blur-sm rounded-2xl border border-[var(--border-main)] p-6 shadow-sm hover:shadow-xl hover:border-primary-blue/30 transition-all cursor-pointer group relative overflow-hidden"
            >
              {/* Subtle Gradient Background for Dark Mode */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <span className="font-mono text-xs font-bold text-primary-blue bg-primary-blue/10 px-2 py-1 rounded-lg">
                    {ticket.ticketNumber}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                    ticket.status === 'resolved' ? 'bg-success-green/10 text-success-green dark:bg-success-green/20 dark:text-medical-teal' : 
                    ticket.status === 'pending' ? 'bg-warning-amber/10 text-warning-amber dark:bg-warning-amber/20' : 
                    'bg-primary-blue/10 text-primary-blue dark:bg-primary-blue/20 dark:text-medical-blue'
                  }`}>
                    {getStatusLabel(ticket.status)}
                  </span>
                </div>
                
                <h3 className="text-lg font-bold text-[var(--text-main)] mb-2 line-clamp-1 group-hover:text-primary-blue transition-all">
                  {ticket.subject}
                </h3>
                
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                    <Tag size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wide">
                      {ticket.department ? (language === 'ar' ? ticket.department.nameAr : ticket.department.nameEn) : 'General'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-4 border-t border-[var(--border-dim)]">
                  <div className="flex items-center gap-2 text-[var(--text-muted)]">
                    <Clock size={14} />
                    <span className="text-xs font-medium">{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 px-2 py-1 rounded-lg ${
                    ticket.priority === 'critical' ? 'bg-danger-red/10 text-danger-red dark:bg-danger-red/20' : 
                    ticket.priority === 'high' ? 'bg-orange-500/10 text-orange-500 dark:bg-orange-500/20' : 
                    'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      ticket.priority === 'critical' ? 'bg-danger-red' : 
                      ticket.priority === 'high' ? 'bg-orange-500' : 'bg-slate-400'
                    }`} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{ticket.priority}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] px-6 py-4">
          <p className="text-xs text-[var(--text-secondary)]">
            {language === 'ar' 
              ? `عرض ${((currentPage - 1) * pageSize) + 1}-${Math.min(currentPage * pageSize, totalCount)} من ${totalCount}`
              : `Showing ${((currentPage - 1) * pageSize) + 1}-${Math.min(currentPage * pageSize, totalCount)} of ${totalCount}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-4 py-2 rounded-xl border border-[var(--border-main)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--border-dim)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
              {language === 'ar' ? 'السابق' : 'Previous'}
            </button>
            <span className="px-4 py-2 text-sm font-bold text-[var(--text-secondary)]">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-4 py-2 rounded-xl border border-[var(--border-main)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--border-dim)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {language === 'ar' ? 'التالي' : 'Next'}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
