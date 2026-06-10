import React, { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../store/authStore.ts';
import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { apiFetch } from '../../core/api.ts';
import ErrorBanner from '../../components/ErrorBanner.tsx';
import { 
  Inbox, 
  Search, 
  Filter, 
  Clock, 
  User, 
  Tag, 
  ChevronRight, 
  AlertCircle, 
  CheckSquare, 
  Square, 
  UserPlus, 
  RefreshCw,
  Columns,
  ArrowUpDown,
  ChevronDown,
  LayoutGrid,
  List,
  Archive
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
  slaDeadline?: string;
  dueDate?: string;
}

export default function InboxPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creatorNameFilter, setCreatorNameFilter] = useState('');
  const [agentIdFilter, setAgentIdFilter] = useState('all');
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedTickets, setSelectedTickets] = useState<number[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, pages: 1 });
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['ticketNumber', 'subject', 'creator', 'priority', 'status', 'date', 'dueDate']);
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const { accessToken, user } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  useEffect(() => {
    let isMounted = true;
    const fetchAgents = async () => {
      try {
        const res = await apiFetch('/api/admin/users');
        const users = Array.isArray(res) ? res : res.data;
        if (isMounted) {
          if (user?.role !== 'super_admin') {
            setAgents(users.filter((u: any) => u.departmentId === user?.departmentId));
          } else {
            setAgents(users);
          }
        }
      } catch (error: any) {
        if (isMounted) { setError(error?.message || 'Something went wrong'); console.error('Error fetching agents:', error); }
      }
    };
    fetchAgents();
    return () => { isMounted = false; };
  }, [user?.role, user?.departmentId]);

  const fetchTickets = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter === 'all' ? '' : statusFilter,
        priority: priorityFilter === 'all' ? '' : priorityFilter,
        search: searchTerm,
        startDate,
        endDate,
        creatorName: creatorNameFilter,
        agentId: agentIdFilter,
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      });

      const data = await apiFetch(`/api/tickets/department?${params.toString()}`, { signal });
      setTickets(data.tickets);
      setPagination(data.pagination);
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
  }, [statusFilter, priorityFilter, startDate, endDate, creatorNameFilter, agentIdFilter, pagination.page, searchTerm]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination(p => ({ ...p, page: 1 }));
  };

  const handleSelectAll = () => {
    if (selectedTickets.length === tickets.length) {
      setSelectedTickets([]);
    } else {
      setSelectedTickets(tickets.map(t => t.id));
    }
  };

  const handleSelectTicket = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedTickets.includes(id)) {
      setSelectedTickets(selectedTickets.filter(tid => tid !== id));
    } else {
      setSelectedTickets([...selectedTickets, id]);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    if (!status || selectedTickets.length === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch('/api/tickets/bulk-update-status', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ ticketIds: selectedTickets, status })
      });
      if (res.ok) {
        setSelectedTickets([]);
        fetchTickets();
      }
    } catch (error: any) {
      setError(error?.message || 'Something went wrong');
      console.error('Error in bulk status update:', error);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkAssign = async (agentId: string) => {
    if (!agentId || selectedTickets.length === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch('/api/tickets/bulk-assign', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ ticketIds: selectedTickets, agentId: agentId === 'unassign' ? null : agentId })
      });
      if (res.ok) {
        setSelectedTickets([]);
        fetchTickets();
      }
    } catch (error: any) {
      setError(error?.message || 'Something went wrong');
      console.error('Error in bulk assignment:', error);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedTickets.length === 0) return;
    if (!confirm(t.confirmBulkArchive)) return;
    
    setBulkActionLoading(true);
    try {
      const res = await fetch('/api/tickets/bulk-archive', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ ticketIds: selectedTickets })
      });
      if (res.ok) {
        setSelectedTickets([]);
        fetchTickets();
      }
    } catch (error: any) {
      setError(error?.message || 'Something went wrong');
      console.error('Error in bulk archive:', error);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedTickets = useMemo(() => {
    if (!sortConfig) return tickets;
    return [...tickets].sort((a: any, b: any) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (sortConfig.key === 'creator') {
        aVal = a.creatorName;
        bVal = b.creatorName;
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tickets, sortConfig]);

  const columns = [
    { id: 'ticketNumber', label: t.ticketNumber },
    { id: 'subject', label: t.subject },
    { id: 'creator', label: t.creator },
    { id: 'priority', label: t.priority },
    { id: 'status', label: t.status },
    { id: 'date', label: t.date },
    { id: 'dueDate', label: t.dueDate },
    { id: 'assignedTo', label: t.assignedTo },
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-danger-red/10 text-danger-red dark:bg-danger-red/20 dark:text-rose-400';
      case 'high': return 'bg-orange-500/10 text-orange-500 dark:bg-orange-500/20 dark:text-orange-400';
      case 'normal': return 'bg-primary-blue/10 text-primary-blue dark:bg-primary-blue/20 dark:text-medical-blue';
      default: return 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return t.pending;
      case 'open': return t.open;
      case 'in_progress': return t.inProgress;
      case 'resolved': return t.resolved;
      case 'closed': return t.closed;
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} onRetry={() => { setError(null); fetchTickets?.(); }} onDismiss={() => setError(null)} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-3">
            <Inbox className="text-primary-blue" />
            {t.departmentInbox}
          </h2>
          <p className="text-[var(--text-secondary)]">
            {t.ticketsFor.replace('{department}', language === 'ar' ? (user?.department?.nameAr || '') : (user?.department?.nameEn || ''))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
            <input
              type="text"
              placeholder={t.search}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-surface pl-10 pr-4 py-2 w-64 bg-[var(--bg-surface)]/50"
            />
          </form>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-surface px-4 py-2 bg-[var(--bg-surface)]/50"
          >
            <option value="all">{t.allStatuses}</option>
            <option value="pending">{t.pending}</option>
            <option value="open">{t.open}</option>
            <option value="in_progress">{t.inProgress}</option>
            <option value="resolved">{t.resolved}</option>
            <option value="closed">{t.closed}</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="input-surface px-4 py-2 bg-[var(--bg-surface)]/50"
          >
            <option value="all">{t.allPriorities}</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>

          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input-surface px-3 py-2 text-xs bg-[var(--bg-surface)]/50"
            />
            <span className="text-[var(--text-muted)]">-</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input-surface px-3 py-2 text-xs bg-[var(--bg-surface)]/50"
            />
          </div>

          <input
            type="text"
            placeholder={t.creatorName}
            value={creatorNameFilter}
            onChange={(e) => setCreatorNameFilter(e.target.value)}
            className="input-surface px-4 py-2 w-40 bg-[var(--bg-surface)]/50"
          />

          <select
            value={agentIdFilter}
            onChange={(e) => setAgentIdFilter(e.target.value)}
            className="input-surface px-4 py-2 bg-[var(--bg-surface)]/50"
          >
            <option value="all">{t.allAgents}</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {language === 'ar' ? agent.fullNameAr : agent.fullNameEn}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <div className="flex items-center premium-card p-1 shadow-sm">
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
                className="flex items-center gap-2 px-4 py-2 premium-card shadow-sm text-sm font-bold text-[var(--text-secondary)] transition-all"
              >
                <Columns size={18} />
                <span>{t.columns}</span>
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

      <div className="premium-card overflow-hidden">
        {selectedTickets.length > 0 && (
          <div className="bg-primary-blue/10 px-6 py-4 flex items-center justify-between border-b border-primary-blue/20">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-primary-blue">
                {t.ticketsSelected.replace('{count}', String(selectedTickets.length))}
              </span>
              <button 
                onClick={() => setSelectedTickets([])}
                className="text-xs font-bold text-[var(--text-secondary)] hover:text-danger-red transition-all uppercase tracking-widest"
              >
                {t.clearSelection}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="text-[var(--text-muted)]" />
                <select 
                  onChange={(e) => handleBulkStatusChange(e.target.value)}
                  disabled={bulkActionLoading}
                  className="bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary-blue"
                >
                  <option value="">{t.changeStatus}</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <UserPlus size={14} className="text-[var(--text-muted)]" />
                <select 
                  onChange={(e) => handleBulkAssign(e.target.value)}
                  disabled={bulkActionLoading}
                  className="bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary-blue"
                >
                  <option value="">{t.assignTo}</option>
                  <option value="unassign">{t.unassign}</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {language === 'ar' ? agent.fullNameAr : agent.fullNameEn}
                    </option>
                  ))}
                </select>
              </div>

              <button 
                onClick={handleBulkArchive}
                disabled={bulkActionLoading}
                className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-lg px-3 py-1.5 text-xs font-bold text-warning-amber hover:bg-warning-amber/5 transition-all outline-none"
              >
                <Archive size={14} />
                <span>{t.archiveAction}</span>
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          {viewMode === 'table' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--border-dim)]/30 border-b border-[var(--border-dim)]">
                  <th className="px-6 py-4 w-10">
                    <button onClick={handleSelectAll} className="text-[var(--text-muted)] hover:text-primary-blue transition-all">
                      {selectedTickets.length === tickets.length && tickets.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                  </th>
                  {visibleColumns.includes('ticketNumber') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('ticketNumber')}>
                      <div className="flex items-center gap-1">
                        {t.ticketNumber}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('subject') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('subject')}>
                      <div className="flex items-center gap-1">
                        {t.subject}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('creator') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('creator')}>
                      <div className="flex items-center gap-1">
                        {t.creator}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('priority') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('priority')}>
                      <div className="flex items-center gap-1">
                        {t.priority}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('status') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-1">
                        {t.status}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('date') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('createdAt')}>
                      <div className="flex items-center gap-1">
                        {t.date}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('dueDate') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-primary-blue transition-all" onClick={() => handleSort('dueDate')}>
                      <div className="flex items-center gap-1">
                        {t.dueDate}
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  )}
                  {visibleColumns.includes('assignedTo') && (
                    <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                      {t.assignedTo}
                    </th>
                  )}
                  <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-dim)]">
                {loading ? (
                  <tr><td colSpan={10} className="px-6 py-12 text-center text-[var(--text-muted)]">{t.loading}</td></tr>
                ) : sortedTickets.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-12 text-center text-[var(--text-muted)]">{t.noResults}</td></tr>
                ) : sortedTickets.map((ticket) => (
                  <tr 
                    key={ticket.id} 
                    className={`hover:bg-[var(--bg-main)] transition-all cursor-pointer group ${selectedTickets.includes(ticket.id) ? 'bg-primary-blue/5' : ''}`}
                    onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: `/tickets/${ticket.id}` }))}
                  >
                    <td className="px-6 py-4">
                      <button 
                        onClick={(e) => handleSelectTicket(ticket.id, e)}
                        className={`transition-all ${selectedTickets.includes(ticket.id) ? 'text-primary-blue' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'}`}
                      >
                        {selectedTickets.includes(ticket.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    </td>
                    {visibleColumns.includes('ticketNumber') && (
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs font-bold text-primary-blue bg-primary-blue/5 px-2 py-1 rounded-lg">{ticket.ticketNumber}</span>
                      </td>
                    )}
                    {visibleColumns.includes('subject') && (
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-[var(--text-main)] line-clamp-1 group-hover:text-primary-blue transition-all">{ticket.subject}</span>
                          {ticket.ticketType && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ticket.ticketType.color }} />
                              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                                {language === 'ar' ? ticket.ticketType.nameAr : ticket.ticketType.nameEn}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('creator') && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
                            <User size={14} />
                          </div>
                          <span className="text-sm text-[var(--text-secondary)] font-medium">{ticket.creatorName}</span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('priority') && (
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-center ${getPriorityColor(ticket.priority)}`}>
                            {ticket.priority}
                          </span>
                          {ticket.slaDeadline && new Date(ticket.slaDeadline) < new Date() && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                            <span className="text-[9px] font-bold text-danger-red dark:text-rose-400 uppercase tracking-tighter flex items-center gap-1 justify-center">
                              <AlertCircle size={10} />
                              {t.overdue}
                            </span>
                          )}
                        </div>
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
                            ticket.status === 'resolved' ? 'text-success-green dark:text-medical-teal' : 
                            ticket.status === 'pending' ? 'text-warning-amber' : 'text-primary-blue dark:text-medical-blue'
                          }`}>
                            {getStatusLabel(ticket.status)}
                          </span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('date') && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-[var(--text-muted)]">
                          <Clock size={14} />
                          <span className="text-xs font-medium">{new Date(ticket.createdAt).toLocaleDateString()}</span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('dueDate') && (
                      <td className="px-6 py-4">
                        {ticket.dueDate ? (
                          <div className={`flex items-center gap-2 ${new Date(ticket.dueDate) < new Date() && ticket.status !== 'resolved' && ticket.status !== 'closed' ? 'text-danger-red' : 'text-indigo-500'}`}>
                            <Clock size={14} />
                            <span className="text-xs font-bold">{new Date(ticket.dueDate).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">-</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.includes('assignedTo') && (
                      <td className="px-6 py-4">
                        {ticket.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-[10px] font-bold text-primary-blue">
                              {language === 'ar' ? ticket.assignedTo.fullNameAr.charAt(0) : ticket.assignedTo.fullNameEn.charAt(0)}
                            </div>
                            <span className="text-xs text-[var(--text-secondary)]">
                              {language === 'ar' ? ticket.assignedTo.fullNameAr : ticket.assignedTo.fullNameEn}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)] italic">{language === 'ar' ? 'غير معين' : 'Unassigned'}</span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 text-right">
                      <ChevronRight className="text-[var(--text-muted)] group-hover:text-primary-blue transition-all" size={20} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
              {sortedTickets.map(ticket => (
                <motion.div
                  layout
                  key={ticket.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: `/tickets/${ticket.id}` }))}
                  className={`bg-[var(--bg-surface)] rounded-2xl border p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer group relative ${selectedTickets.includes(ticket.id) ? 'border-primary-blue ring-2 ring-primary-blue/20' : 'border-[var(--border-main)]'}`}
                >
                  <div className="absolute top-4 right-4">
                    <button 
                      onClick={(e) => handleSelectTicket(ticket.id, e)}
                      className={`transition-all ${selectedTickets.includes(ticket.id) ? 'text-primary-blue' : 'text-[var(--text-muted)] group-hover:text-[var(--text-muted)]'}`}
                    >
                      {selectedTickets.includes(ticket.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <span className="font-mono text-xs font-bold text-primary-blue bg-primary-blue/5 px-2 py-1 rounded-lg">{ticket.ticketNumber}</span>
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-[var(--text-main)] mb-2 line-clamp-1 group-hover:text-primary-blue transition-all">{ticket.subject}</h3>
                  
                  <div className="flex items-center gap-2 mb-4 text-[var(--text-secondary)]">
                    <User size={14} />
                    <span className="text-xs font-medium">{ticket.creatorName}</span>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-[var(--border-dim)]">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${ticket.status === 'resolved' ? 'bg-success-green' : 'bg-primary-blue'}`} />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">{getStatusLabel(ticket.status)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[var(--text-muted)]">
                      <Clock size={12} />
                      <span className="text-[10px]">{new Date(ticket.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {ticket.dueDate && (
                    <div className={`mt-3 pt-3 border-t border-[var(--border-dim)] flex items-center justify-between ${new Date(ticket.dueDate) < new Date() && ticket.status !== 'resolved' && ticket.status !== 'closed' ? 'text-danger-red' : 'text-indigo-500'}`}>
                      <span className="text-[10px] font-bold uppercase tracking-widest">{t.dueDateLabel}</span>
                      <span className="text-xs font-bold">{new Date(ticket.dueDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
        
        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="px-6 py-4 bg-[var(--border-dim)]/50 border-t border-[var(--border-dim)] flex items-center justify-between">
            <span className="text-xs text-[var(--text-secondary)]">
              {t.total} {pagination.total} {t.tickets}
            </span>
            <div className="flex items-center gap-2">
              <button 
                disabled={pagination.page === 1}
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                className="p-2 rounded-lg border border-[var(--border-main)] hover:bg-[var(--bg-surface)] disabled:opacity-50 transition-all"
              >
                <ChevronRight size={16} className="rotate-180" />
              </button>
              <span className="text-xs font-bold text-[var(--text-secondary)]">
                {pagination.page} / {pagination.pages}
              </span>
              <button 
                disabled={pagination.page === pagination.pages}
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                className="p-2 rounded-lg border border-[var(--border-main)] hover:bg-[var(--bg-surface)] disabled:opacity-50 transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
