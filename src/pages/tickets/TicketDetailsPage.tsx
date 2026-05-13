import React, { useState, useEffect } from 'react';
// BUG FIX #2: Removed direct `import { io }` — TicketDetailsPage no longer creates
// its own socket. Real-time updates come via the global NotificationProvider socket,
// which re-emits ticket-specific events via custom DOM events.
import { useAuthStore } from '../../store/authStore.ts';

import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { 
  ArrowLeft, 
  MessageSquare, 
  History, 
  User, 
  Clock, 
  Tag, 
  Building2, 
  Layers, 
  Phone, 
  Hash, 
  Send, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  UserPlus,
  RefreshCw,
  XCircle,
  Paperclip,
  X,
  Search,
  File as FileIcon,
  Archive,
  Share2
} from 'lucide-react';
import { motion } from 'motion/react';

interface Attachment {
  id: number;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

interface Comment {
  id: number;
  body: string;
  createdAt: string;
  messageType: string;
  sender: { fullNameAr: string; fullNameEn: string; avatarUrl: string | null };
  attachments: Attachment[];
}

interface AuditLog {
  id: number;
  action: string;
  oldData: any;
  newData: any;
  createdAt: string;
  userId: number;
}

interface TicketTransfer {
  id: number;
  fromDepartmentId: number;
  toDepartmentId: number;
  transferredById: number;
  reason: string | null;
  createdAt: string;
  fromDepartment: { nameAr: string; nameEn: string };
  toDepartment: { nameAr: string; nameEn: string };
  transferredBy: { fullNameAr: string; fullNameEn: string };
}

interface Ticket {
  id: number;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  slaDeadline: string | null;
  createdAt: string;
  dueDate?: string;
  relatedTickets?: string; // JSON string
  buildingName: string | null;
  floorName: string | null;
  roomExtension: string | null;
  creatorName: string;
  creatorPhone: string | null;
  creatorExtension: string | null;
  creatorDeptName: string | null;
  createdById: number;
  departmentId: number;
  assignedToId: number | null;
  ticketTypeId: number | null;
  isArchived: boolean;
  requiresExternalResource: boolean;
  externalResourceCost: number | null;
  externalResourceNote: string | null;
  department?: { nameAr: string; nameEn: string };
  ticketType?: { nameAr: string; nameEn: string; color: string };
  createdBy?: { fullNameAr: string; fullNameEn: string; avatarUrl: string | null; badgeNumber: string };
  assignedTo?: { id: number; fullNameAr: string; fullNameEn: string; avatarUrl: string | null };
  messages: Comment[];
  auditLogs: AuditLog[];
  attachments: Attachment[];
  transfers: TicketTransfer[];
}

export default function TicketDetailsPage({ ticketId }: { ticketId: number }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');
  const [agents, setAgents] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [ticketTypes, setTicketTypes] = useState<any[]>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferDeptId, setTransferDeptId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveTypeId, setResolveTypeId] = useState('');
  const [resolveExternal, setResolveExternal] = useState(false);
  const [resolveExternalCost, setResolveExternalCost] = useState('');
  const [resolveExternalNote, setResolveExternalNote] = useState('');

  const [relatedTicketsData, setRelatedTicketsData] = useState<any[]>([]);
  const [showDueDateModal, setShowDueDateModal] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearchTerm, setLinkSearchTerm] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState<any[]>([]);

  const { accessToken, user } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetch = async () => {
      try {
        await fetchTicket(controller.signal);
        if (isMounted) {
          await fetchAgents(controller.signal);
          await fetchDepartments(controller.signal);
          await fetchTicketTypes(controller.signal);
        }
      } catch (error) {
        if (isMounted) console.error('Error fetching ticket data:', error);
      }
    };
    fetch();

    // Check for confirm param
    const params = new URLSearchParams(window.location.search);
    if (params.get('confirm') === 'true') {
      setShowConfirmModal(true);
    }

    return () => {
      controller.abort();
      isMounted = false;
    };
  }, [ticketId]);

  // BUG FIX #2: No longer creates its own socket here. Real-time ticket events
  // are received via the NotificationProvider's shared socket, which broadcasts
  // 'ticket-status-updated' and 'new-comment' as window custom events.
  // This eliminates the duplicate socket connection per ticket-detail view.
  useEffect(() => {
    const handleStatusUpdate = (e: any) => {
      const data = e.detail;
      if (data?.id === ticketId) {
        setTicket(prev => prev ? { ...prev, status: data.status } : null);
      }
    };
    const handleNewComment = (e: any) => {
      const data = e.detail;
      if (data?.ticketId === ticketId) {
        setTicket(prev => {
          if (!prev) return null;
          if (prev.messages.some((m: any) => m.id === data.message.id)) return prev;
          return { ...prev, messages: [...prev.messages, data.message] };
        });
      }
    };
    const handleReassigned = (e: any) => {
      const data = e.detail;
      if (data?.id === ticketId) {
        fetchTicket(); // Refresh to get new assignee details
      }
    };
    window.addEventListener('ws:ticket-status-updated', handleStatusUpdate);
    window.addEventListener('ws:new-comment', handleNewComment);
    window.addEventListener('ws:ticket-assigned', handleReassigned);
    return () => {
      window.removeEventListener('ws:ticket-status-updated', handleStatusUpdate);
      window.removeEventListener('ws:new-comment', handleNewComment);
      window.removeEventListener('ws:ticket-assigned', handleReassigned);
    };
  }, [ticketId]);

  useEffect(() => {
    if (ticket?.relatedTickets) {
      let isMounted = true;
      const controller = new AbortController();
      const fetch = async () => {
        try {
          await fetchRelatedTickets(controller.signal);
        } catch (error) {
          if (isMounted) console.error('Error fetching related tickets:', error);
        }
      };
      fetch();
      return () => {
        controller.abort();
        isMounted = false;
      };
    }
  }, [ticket?.relatedTickets]);

  const fetchRelatedTickets = async (signal?: AbortSignal) => {
    try {
      const ids = JSON.parse(ticket!.relatedTickets || '[]');
      if (ids.length === 0) {
        setRelatedTicketsData([]);
        return;
      }
      
      const res = await fetch(`/api/tickets/department?status=all`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal
      });
      const data = await res.json();
      if (res.ok) {
        setRelatedTicketsData(data.tickets.filter((t: any) => ids.includes(t.id.toString())));
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Error fetching related tickets:', error);
    }
  };

  const handleLinkSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkSearchTerm.trim()) return;
    try {
      const res = await fetch(`/api/tickets/department?search=${linkSearchTerm}&status=all`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setLinkSearchResults(data.tickets.filter((t: any) => t.id !== ticket?.id));
      }
    } catch (error) {
      console.error('Error searching for tickets to link:', error);
    }
  };

  const handleLinkTicket = async (targetId: number) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/link`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ targetTicketId: targetId })
      });
      if (res.ok) {
        setShowLinkModal(false);
        fetchTicket();
      }
    } catch (error) {
      console.error('Error linking ticket:', error);
    }
  };

  const handleUnlinkTicket = async (targetId: number) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/unlink`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ targetTicketId: targetId })
      });
      if (res.ok) {
        fetchTicket();
      }
    } catch (error) {
      console.error('Error unlinking ticket:', error);
    }
  };

  const handleUpdateDueDate = async () => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/due-date`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ dueDate: newDueDate || null })
      });
      if (res.ok) {
        setShowDueDateModal(false);
        fetchTicket();
      }
    } catch (error) {
      console.error('Error updating due date:', error);
    }
  };

  const fetchTicket = async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal
      });
      
      const contentType = res.headers.get('content-type');
      if (!res.ok || !contentType || !contentType.includes('application/json')) {
        if (!signal?.aborted) {
          const text = await res.text();
          console.error(`Error fetching ticket ${ticketId}: ${res.status} ${res.statusText}`, text);
          setTicket(null);
        }
        return;
      }

      const data = await res.json();
      setTicket(data);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Error fetching ticket:', error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const fetchAgents = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal
      });
      const data = await res.json();
      if (res.ok && ticket && !signal?.aborted) {
        setAgents(data.filter((u: any) => u.departmentId === ticket.departmentId));
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Error fetching agents:', error);
    }
  };

  const fetchDepartments = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/admin/departments', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal
      });
      const data = await res.json();
      if (res.ok && !signal?.aborted) setDepartments(data);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Error fetching departments:', error);
    }
  };

  const fetchTicketTypes = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/admin/ticket-types', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal
      });
      const data = await res.json();
      if (res.ok && !signal?.aborted) setTicketTypes(data.filter((tt: any) => tt.isActive));
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Error fetching ticket types:', error);
    }
  };

  const handleTransfer = async () => {
    if (!transferDeptId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/transfer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ targetDeptId: transferDeptId, reason: transferReason })
      });
      if (res.ok) {
        setShowTransferModal(false);
        fetchTicket();
      }
    } catch (error) {
      console.error('Error transferring ticket:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من أرشفة هذه التذكرة؟' : 'Are you sure you want to archive this ticket?')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/archive`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        fetchTicket();
      } else {
        const data = await res.json();
        alert(data.message || 'Error archiving ticket');
      }
    } catch (error) {
      console.error('Error archiving ticket:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert(language === 'ar' ? 'تم نسخ الرابط إلى الحافظة' : 'Link copied to clipboard');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleCommentFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setCommentAttachments([...commentAttachments, data]);
      }
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() && commentAttachments.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ content: comment, isInternal, attachments: commentAttachments })
      });
      if (res.ok) {
        const newMessage = await res.json();
        setTicket(prev => prev ? { ...prev, messages: [...prev.messages, newMessage] } : null);
        setComment('');
        setCommentAttachments([]);
      }
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus: string, extraFields?: Record<string, any>) => {
    try {
      const body: Record<string, any> = { status: newStatus };
      if (extraFields) Object.assign(body, extraFields);
      const res = await fetch(`/api/tickets/${ticketId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      if (res.ok) {
        fetchTicket();
      } else {
        if (data.code === 'ISSUE_TYPE_REQUIRED') {
          alert(language === 'ar' ? 'يجب اختيار نوع المشكلة قبل حل التذكرة' : 'Issue Type must be selected before resolving the ticket');
        } else {
          alert(data.message || 'Error updating status');
        }
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleUpdateTicketType = async (typeId: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/type`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ ticketTypeId: typeId || null })
      });
      if (res.ok) fetchTicket();
    } catch (error) {
      console.error('Error updating issue type:', error);
    }
  };

  const handleAssign = async (agentId: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ agentId })
      });
      if (res.ok) fetchTicket();
    } catch (error) {
      console.error('Error assigning ticket:', error);
    }
  };

  const handleConfirmResolution = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/confirm`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ rating, feedback })
      });
      if (res.ok) {
        setShowConfirmModal(false);
        fetchTicket();
      }
    } catch (error) {
      console.error('Error confirming resolution:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-[var(--text-muted)]">Loading ticket details...</div>;
  if (!ticket) return <div className="p-8 text-center text-danger-red">Ticket not found or access denied</div>;

  const isAgent = ticket.departmentId === (user?.departmentId || user?.department?.id) || user?.role === 'super_admin';
  const isLocked = (ticket.status === 'resolved' || ticket.status === 'closed') && user?.role !== 'super_admin' && user?.role !== 'supervisor';
  const isArchived = ticket.isArchived;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: '/inbox' }))}
            className="p-2 hover:bg-[var(--bg-elevated)] rounded-xl transition-all text-[var(--text-muted)]"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-mono text-lg font-bold text-primary-blue">{ticket.ticketNumber}</span>
              <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${
                ticket.status === 'resolved' ? 'bg-success-green text-white' : 
                ticket.status === 'pending' ? 'bg-warning-amber text-white' : 'bg-primary-blue text-white'
              }`}>
                {ticket.status}
              </span>
              {ticket.slaDeadline && (
                <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${
                  new Date(ticket.slaDeadline) < new Date() && ticket.status !== 'resolved' && ticket.status !== 'closed'
                    ? 'bg-danger-red text-white'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                }`}>
                  <Clock size={10} />
                  SLA: {new Date(ticket.slaDeadline).toLocaleString()}
                </span>
              )}
              {ticket.dueDate && (
                <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${
                  new Date(ticket.dueDate) < new Date() && ticket.status !== 'resolved' && ticket.status !== 'closed'
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                }`}>
                  <Clock size={10} />
                  DUE: {new Date(ticket.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold text-[var(--text-main)]">{ticket.subject}</h2>
          </div>
        </div>

        {isAgent && !isArchived && (
          <div className="flex items-center gap-3">
            <select
              value={ticket.assignedToId || ''}
              onChange={(e) => handleAssign(e.target.value)}
              disabled={isLocked}
              className="input-surface px-4 py-2 bg-[var(--bg-surface)]/50"
            >
              <option value="">{t.assignedAgent}</option>
              {agents.map(a => <option key={a.id} value={a.id}>{language === 'ar' ? a.fullNameAr : a.fullNameEn}</option>)}
            </select>

            <button 
              onClick={() => setShowTransferModal(true)}
              disabled={isLocked}
              className="flex items-center gap-2 px-4 py-2 premium-card shadow-sm text-sm font-bold text-[var(--text-secondary)] transition-all disabled:opacity-50"
            >
              <RefreshCw size={18} />
              <span>{t.transfer}</span>
            </button>

            <button 
              onClick={handleArchive}
              disabled={isLocked}
              className="flex items-center gap-2 px-4 py-2 premium-card shadow-sm text-sm font-bold text-[var(--text-secondary)] hover:bg-danger-red/5 hover:text-danger-red hover:border-danger-red/20 transition-all disabled:opacity-50"
            >
              <Archive size={18} />
              <span>{language === 'ar' ? 'أرشفة' : 'Archive'}</span>
            </button>

            <button 
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 premium-card shadow-sm text-sm font-bold text-[var(--text-secondary)] transition-all"
            >
              <Share2 size={18} />
              <span>{language === 'ar' ? 'مشاركة' : 'Share'}</span>
            </button>

            <div className="flex items-center gap-2 flex-wrap">
              {['pending', 'open', 'in_progress', 'resolved', 'closed'].map(s => {
                const isCurrent = ticket.status === s;
                // Mirror backend ALLOWED_TRANSITIONS (must stay in sync with workflow.constants.ts)
                const transitions: Record<string, string[]> = {
                  pending:     ['open', 'in_progress', 'closed'],
                  open:        ['in_progress', 'closed'],
                  in_progress: ['resolved', 'closed'],
                  // resolved → closed removed: only creator /confirm or super_admin PATCH can close
                  resolved:    ['in_progress'],
                  closed:      ['in_progress'], // reopen — super_admin only
                };
                const allowed = transitions[ticket.status] || [];
                const isAllowed = allowed.includes(s);

                // Compute reason if disabled
                let disabledReason = '';
                if (!isCurrent && !isAllowed) {
                  disabledReason = language === 'ar' ? 'انتقال غير مسموح' : `Cannot go from ${ticket.status.replace('_', ' ')} to ${s.replace('_', ' ')}`;
                } else if (s === 'resolved' && !ticket.assignedToId) {
                  disabledReason = language === 'ar' ? 'يجب تعيين موظف أولاً' : 'Assign an agent first';
                } else if ((s === 'resolved' || s === 'closed') && !ticket.ticketTypeId) {
                  disabledReason = language === 'ar' ? 'حدد نوع المشكلة أولاً' : 'Set Issue Type first';
                } else if (isLocked && !isCurrent) {
                  disabledReason = language === 'ar' ? 'التذكرة مقفلة' : 'Ticket is locked';
                }

                const isDisabled = isCurrent || (!isAllowed) || (isLocked && !isCurrent) || 
                  (s === 'resolved' && !ticket.assignedToId) ||
                  ((s === 'resolved' || s === 'closed') && !ticket.ticketTypeId);

                return (
                  <div key={s} className="relative group/btn">
                    <button
                      onClick={() => {
                        if (s === 'resolved') {
                          setResolveTypeId(ticket.ticketTypeId?.toString() || '');
                          setResolveExternal(ticket.requiresExternalResource || false);
                          setResolveExternalCost(ticket.externalResourceCost?.toString() || '');
                          setResolveExternalNote(ticket.externalResourceNote || '');
                          setShowResolveModal(true);
                        } else {
                          handleStatusChange(s);
                        }
                      }}
                      disabled={isDisabled}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
                        isCurrent
                           ? 'bg-primary-blue text-white border-primary-blue cursor-default shadow-lg shadow-primary-blue/20 scale-105 z-10' 
                          : isAllowed && !isDisabled
                            ? 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-main)] hover:border-primary-blue hover:text-primary-blue hover:shadow-md'
                            : 'bg-[var(--bg-main)] text-[var(--text-muted)] border-[var(--border-dim)] cursor-not-allowed'
                      }`}
                    >
                      {t[s as keyof typeof t] || s.replace('_', ' ')}
                    </button>
                    {disabledReason && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[var(--bg-elevated)] text-[var(--text-main)] text-[10px] font-bold rounded-lg whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                        {disabledReason}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[var(--border-strong)]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isAgent && ticket.status === 'resolved' && ticket.createdById === user?.id && (
          <button
            onClick={() => setShowConfirmModal(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-success-green text-white font-bold hover:bg-green-600 transition-all shadow-lg shadow-green-500/20"
          >
            <CheckCircle2 size={20} />
            <span>{t.confirmResolution}</span>
          </button>
        )}
      </div>

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="premium-card w-full max-w-md p-8 shadow-2xl"
          >
            <h3 className="text-xl font-bold text-[var(--text-main)] mb-6">
              {language === 'ar' ? 'تحويل التذكرة' : 'Transfer Ticket'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                  {language === 'ar' ? 'القسم المستهدف' : 'Target Department'}
                </label>
                <select 
                  value={transferDeptId}
                  onChange={(e) => setTransferDeptId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] text-sm outline-none focus:ring-2 focus:ring-primary-blue"
                >
                  <option value="">{language === 'ar' ? 'اختر القسم' : 'Select Department'}</option>
                  {departments.filter(d => d.id !== ticket.departmentId).map(d => (
                    <option key={d.id} value={d.id}>{language === 'ar' ? d.nameAr : d.nameEn}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                  {language === 'ar' ? 'السبب' : 'Reason'}
                </label>
                <textarea 
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="input-surface w-full h-24 resize-none bg-[var(--bg-main)]"
                  placeholder={language === 'ar' ? 'لماذا يتم تحويل هذه التذكرة؟' : 'Why is this ticket being transferred?'}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-[var(--border-main)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--border-dim)] transition-all"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button 
                  onClick={handleTransfer}
                  disabled={!transferDeptId || submitting}
                  className="flex-1 px-6 py-3 rounded-xl bg-primary-blue text-white text-sm font-bold hover:bg-blue-600 transition-all disabled:opacity-50"
                >
                  {submitting ? '...' : (language === 'ar' ? 'تأكيد التحويل' : 'Confirm Transfer')}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="premium-card w-full max-w-lg p-8 shadow-2xl"
          >
            <h3 className="text-xl font-bold text-[var(--text-main)] mb-6">
              {language === 'ar' ? 'حل التذكرة' : 'Resolve Ticket'}
            </h3>
            
            <div className="space-y-6">
              {/* Ticket Type */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                  {language === 'ar' ? 'نوع المشكلة' : 'Issue Type'}
                </label>
                <select
                  value={resolveTypeId}
                  onChange={(e) => setResolveTypeId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] text-sm outline-none focus:ring-2 focus:ring-primary-blue"
                >
                  <option value="">{language === 'ar' ? 'اختر النوع' : 'Select Type'}</option>
                  {ticketTypes
                    .filter(tt => !tt.departmentId || tt.departmentId === ticket.departmentId)
                    .map(tt => (
                      <option key={tt.id} value={tt.id}>
                        {language === 'ar' ? tt.nameAr : tt.nameEn}
                      </option>
                    ))}
                </select>
              </div>

              {/* External Resource Toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ext-resource"
                  checked={resolveExternal}
                  onChange={(e) => setResolveExternal(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border-main)] text-primary-blue focus:ring-primary-blue"
                />
                <label htmlFor="ext-resource" className="text-sm font-bold text-[var(--text-secondary)] cursor-pointer">
                  {language === 'ar' ? 'تم الحل باستخدام موارد خارجية' : 'Resolved using external resources'}
                </label>
              </div>

              {/* External Resource Fields */}
              {resolveExternal && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4 pl-7"
                >
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                      {language === 'ar' ? 'التكلفة' : 'Cost'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={resolveExternalCost}
                      onChange={(e) => setResolveExternalCost(e.target.value)}
                      placeholder={language === 'ar' ? 'أدخل التكلفة' : 'Enter cost'}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] text-sm outline-none focus:ring-2 focus:ring-primary-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                      {language === 'ar' ? 'ملاحظات' : 'Notes'}
                    </label>
                    <textarea
                      value={resolveExternalNote}
                      onChange={(e) => setResolveExternalNote(e.target.value)}
                      placeholder={language === 'ar' ? 'أضف ملاحظات حول المورد الخارجي...' : 'Add notes about the external resource...'}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] text-sm outline-none focus:ring-2 focus:ring-primary-blue h-20 resize-none"
                    />
                  </div>
                </motion.div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowResolveModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-[var(--border-main)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--border-dim)] transition-all"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={() => {
                    if (!resolveTypeId) {
                      alert(language === 'ar' ? 'يرجى اختيار نوع المشكلة' : 'Please select an issue type');
                      return;
                    }
                    setShowResolveModal(false);
                    handleStatusChange('resolved', {
                      ticketTypeId: resolveTypeId,
                      requiresExternalResource: resolveExternal,
                      externalResourceCost: resolveExternalCost || null,
                      externalResourceNote: resolveExternalNote || null
                    });
                  }}
                  disabled={!resolveTypeId}
                  className="flex-1 px-6 py-3 rounded-xl bg-success-green text-white text-sm font-bold hover:bg-green-600 transition-all disabled:opacity-50"
                >
                  {language === 'ar' ? 'تأكيد الحل' : 'Confirm Resolve'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="premium-card w-full max-w-md p-8 shadow-2xl"
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-success-green/10 text-success-green rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-[var(--text-main)]">
                {t.confirmResolution}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">{t.howWasService}</p>
            </div>
            
            <div className="space-y-6">
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className={`text-2xl transition-all ${star <= rating ? 'text-warning-amber scale-110' : 'text-[var(--text-muted)]'}`}
                  >
                    ★
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                  {t.feedback}
                </label>
                <textarea 
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] text-sm outline-none focus:ring-2 focus:ring-primary-blue h-24 resize-none"
                  placeholder={t.optionalFeedback}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-[var(--border-main)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--border-dim)] transition-all"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button 
                  onClick={handleConfirmResolution}
                  disabled={submitting}
                  className="flex-1 px-6 py-3 rounded-xl bg-success-green text-white text-sm font-bold hover:bg-green-600 transition-all disabled:opacity-50"
                >
                  {submitting ? '...' : t.submitFeedback}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="premium-card p-6">
            <div className="flex items-center gap-2 mb-4 text-[var(--text-muted)]">
              <AlertCircle size={18} />
              <h3 className="font-bold uppercase tracking-widest text-xs">{language === 'ar' ? 'الوصف' : 'Description'}</h3>
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
              {ticket.description}
            </p>

            {/* Transfer History */}
            {ticket.transfers && ticket.transfers.length > 0 && (
              <div className="mt-8 pt-8 border-t border-[var(--border-dim)]">
                <div className="flex items-center gap-2 mb-6">
                  <RefreshCw size={18} className="text-primary-blue" />
                  <h3 className="font-bold uppercase tracking-widest text-xs">{language === 'ar' ? 'سجل التحويلات' : 'Transfer History'}</h3>
                </div>
                <div className="space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--border-dim)]">
                  {ticket.transfers.map((transfer, idx) => (
                    <div key={transfer.id} className="relative pl-10">
                      <div className="absolute left-0 w-8 h-8 rounded-full bg-[var(--bg-surface)] border-2 border-primary-blue flex items-center justify-center z-10">
                        <ArrowLeft size={14} className={`text-primary-blue ${language === 'ar' ? '' : 'rotate-180'}`} />
                      </div>
                      <div className="bg-[var(--border-dim)]/50 p-4 rounded-2xl border border-[var(--border-dim)] transition-all hover:border-primary-blue/30">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap text-sm">
                            <span className="font-bold text-[var(--text-muted)]">{language === 'ar' ? 'من:' : 'From:'}</span>
                            <span className="font-bold text-[var(--text-secondary)]">{language === 'ar' ? transfer.fromDepartment.nameAr : transfer.fromDepartment.nameEn}</span>
                            <ArrowLeft size={14} className={`text-[var(--text-muted)] ${language === 'ar' ? '' : 'rotate-180'}`} />
                            <span className="font-bold text-[var(--text-muted)]">{language === 'ar' ? 'إلى:' : 'To:'}</span>
                            <span className="font-bold text-primary-blue">{language === 'ar' ? transfer.toDepartment.nameAr : transfer.toDepartment.nameEn}</span>
                          </div>
                          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                            {new Date(transfer.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {transfer.reason && (
                          <div className="p-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-dim)] text-xs text-[var(--text-secondary)] italic">
                            "{transfer.reason}"
                          </div>
                        )}
                        <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--text-muted)] font-medium">
                          <User size={12} />
                          {language === 'ar' ? transfer.transferredBy.fullNameAr : transfer.transferredBy.fullNameEn}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ticket.attachments && ticket.attachments.length > 0 && (
              <div className="mt-6 pt-6 border-t border-[var(--border-dim)]">
                <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">
                  {language === 'ar' ? 'المرفقات' : 'Attachments'}
                </h4>
                <div className="flex flex-wrap gap-3">
                  {ticket.attachments.map((file) => (
                    <a 
                      key={file.id}
                      href={`/api/uploads/download/${file.fileName}`} 
                      download
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--border-dim)] border border-[var(--border-dim)] hover:border-primary-blue transition-all group"
                    >
                      <FileIcon size={18} className="text-primary-blue" />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-[var(--text-secondary)] group-hover:text-primary-blue transition-all">{file.fileName}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{(file.fileSize / 1024).toFixed(1)} KB</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Interaction Section */}
          <div className="premium-card overflow-hidden">
            <div className="flex border-b border-[var(--border-dim)] bg-[var(--border-dim)]">
              <button 
                onClick={() => setActiveTab('comments')}
                className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'comments' ? 'text-primary-blue border-b-2 border-primary-blue bg-primary-blue/5' : 'text-[var(--text-muted)]'
                }`}
              >
                <MessageSquare size={18} />
                {language === 'ar' ? 'التعليقات' : 'Comments'}
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'history' ? 'text-primary-blue border-b-2 border-primary-blue bg-primary-blue/5' : 'text-[var(--text-muted)]'
                }`}
              >
                <History size={18} />
                {language === 'ar' ? 'السجل' : 'History'}
              </button>
            </div>

            <div className="p-6">
              {activeTab === 'comments' ? (
                <div className="space-y-6">
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {ticket.messages.length === 0 ? (
                      <div className="text-center py-8 text-[var(--text-muted)] text-sm italic">No comments yet</div>
                    ) : ticket.messages.map((c) => (
                      <div key={c.id} className={`flex gap-3 ${c.messageType === 'internal_note' ? 'bg-warning-amber/5 p-4 rounded-2xl border border-warning-amber/10 dark:border-warning-amber/20' : ''}`}>
                        <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)] shrink-0 overflow-hidden">
                          {c.sender.avatarUrl ? (
                            <img src={c.sender.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : <User size={20} />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-sm text-[var(--text-main)]">
                              {language === 'ar' ? c.sender.fullNameAr : c.sender.fullNameEn}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">{new Date(c.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-[var(--text-secondary)]">{c.body}</p>
                          {c.attachments && c.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {c.attachments.map((file) => (
                                <a 
                                  key={file.id}
                                  href={`/api/uploads/download/${file.fileName}`} 
                                  download
                                  className="flex items-center gap-2 p-2 rounded-lg bg-[var(--border-dim)] border border-[var(--border-dim)] hover:border-primary-blue transition-all group"
                                >
                                  <FileIcon size={14} className="text-primary-blue" />
                                  <span className="text-[10px] font-bold text-[var(--text-secondary)] group-hover:text-primary-blue transition-all line-clamp-1 max-w-[100px]">{file.fileName}</span>
                                </a>
                              ))}
                            </div>
                          )}
                          {c.messageType === 'internal_note' && (
                            <span className="inline-block mt-2 px-2 py-0.5 bg-warning-amber/10 text-warning-amber text-[10px] font-bold uppercase tracking-widest rounded">
                              Internal Note
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleAddComment} className="space-y-4 pt-4 border-t border-[var(--border-dim)]">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={language === 'ar' ? 'اكتب تعليقاً...' : 'Write a comment...'}
                      className="input-surface w-full min-h-[100px] bg-[var(--bg-main)]"
                    />

                    {commentAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {commentAttachments.map((file, idx) => (
                          <div key={idx} className="relative group bg-[var(--bg-elevated)] p-2 rounded-lg border border-[var(--border-main)] flex items-center gap-2">
                            <FileIcon size={14} className="text-primary-blue" />
                            <span className="text-[10px] font-bold text-[var(--text-secondary)] line-clamp-1 max-w-[100px]">{file.fileName}</span>
                            <button 
                              type="button"
                              onClick={() => setCommentAttachments(commentAttachments.filter((_, i) => i !== idx))}
                              className="text-danger-red hover:scale-110 transition-all"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {isAgent && (
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={isInternal} 
                              onChange={(e) => setIsInternal(e.target.checked)}
                              className="w-4 h-4 rounded border-[var(--border-main)] text-warning-amber focus:ring-warning-amber" 
                            />
                            <span className="text-xs font-bold text-[var(--text-muted)] group-hover:text-warning-amber transition-all uppercase tracking-widest">
                              Internal Note
                            </span>
                          </label>
                        )}
                        <label className="flex items-center gap-2 cursor-pointer text-[var(--text-muted)] hover:text-primary-blue transition-all">
                          <input type="file" className="hidden" onChange={handleCommentFileUpload} disabled={uploading} />
                          <Paperclip size={18} />
                          <span className="text-xs font-bold uppercase tracking-widest">{uploading ? '...' : (language === 'ar' ? 'إرفاق' : 'Attach')}</span>
                        </label>
                      </div>
                      <button
                        type="submit"
                        disabled={submitting || (!comment.trim() && commentAttachments.length === 0)}
                        className="flex items-center gap-2 bg-primary-blue text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-800 transition-all disabled:opacity-50"
                      >
                        <Send size={18} />
                        {language === 'ar' ? 'إرسال' : 'Send'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="space-y-4">
                  {ticket.auditLogs.map((log) => (
                    <div key={log.id} className="flex gap-4 items-start">
                      <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                        <History size={14} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-[var(--text-main)]">
                          {log.action === 'STATUS_CHANGED' ? (language === 'ar' ? 'تغيير الحالة' : 'Status Changed') :
                           log.action === 'ASSIGNED' ? (language === 'ar' ? 'تم التعيين' : 'Assigned') :
                           log.action === 'TRANSFERRED' ? (language === 'ar' ? 'تم التحويل' : 'Transferred') :
                           log.action === 'DUE_DATE_CHANGED' ? (language === 'ar' ? 'تغيير موعد الاستحقاق' : 'Due Date Changed') :
                           log.action === 'TICKET_LINKED' ? (language === 'ar' ? 'تم ربط تذكرة' : 'Ticket Linked') :
                           log.action === 'TICKET_UNLINKED' ? (language === 'ar' ? 'تم إلغاء ربط تذكرة' : 'Ticket Unlinked') :
                           log.action}
                        </p>
                        <div className="mt-1 space-y-1">
                          {log.newData?.status && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              {language === 'ar' ? 'الحالة الجديدة: ' : 'New Status: '}
                              <span className="font-bold text-primary-blue">{log.newData.status}</span>
                            </p>
                          )}
                          {log.newData?.assignedToName && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              {language === 'ar' ? 'تم التعيين لـ: ' : 'Assigned to: '}
                              <span className="font-bold text-primary-blue">{log.newData.assignedToName}</span>
                            </p>
                          )}
                          {log.newData?.departmentName && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              {language === 'ar' ? 'تم التحويل لـ: ' : 'Transferred to: '}
                              <span className="font-bold text-primary-blue">{log.newData.departmentName}</span>
                            </p>
                          )}
                          {log.newData?.dueDate && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              {language === 'ar' ? 'موعد الاستحقاق الجديد: ' : 'New Due Date: '}
                              <span className="font-bold text-primary-blue">{new Date(log.newData.dueDate).toLocaleDateString()}</span>
                            </p>
                          )}
                          {log.newData?.comment && (
                            <p className="text-xs italic text-[var(--text-muted)] mt-1">"{log.newData.comment}"</p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                              {log.newData?.performedBy || 'System'}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">•</span>
                            <span className="text-[10px] text-[var(--text-muted)]">{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {/* Creator Info */}
          <div className="bg-[var(--bg-surface)]/50 dark:backdrop-blur-sm rounded-2xl border border-[var(--border-main)] p-6 shadow-sm">
            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6">{language === 'ar' ? 'معلومات المنشئ' : 'Creator Info'}</h3>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)] overflow-hidden">
                {ticket.createdBy?.avatarUrl ? (
                  <img src={ticket.createdBy.avatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : <User size={24} />}
              </div>
              <div>
                <p className="font-bold text-[var(--text-main)]">
                  {language === 'ar' ? ticket.createdBy?.fullNameAr : ticket.createdBy?.fullNameEn}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">{ticket.createdBy?.badgeNumber}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Phone size={16} className="text-[var(--text-muted)]" />
                <span className="text-[var(--text-secondary)]">{ticket.creatorPhone || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Hash size={16} className="text-[var(--text-muted)]" />
                <span className="text-[var(--text-secondary)]">{ticket.creatorExtension || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Building2 size={16} className="text-[var(--text-muted)]" />
                <span className="text-[var(--text-secondary)]">{ticket.creatorDeptName || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Location Info */}
          <div className="bg-[var(--bg-surface)]/50 dark:backdrop-blur-sm rounded-2xl border border-[var(--border-main)] p-6 shadow-sm">
            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6">{language === 'ar' ? 'الموقع' : 'Location'}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 text-[var(--text-muted)]">
                  <Building2 size={16} />
                  <span>{language === 'ar' ? 'المبنى' : 'Building'}</span>
                </div>
                <span className="font-bold text-[var(--text-main)]">{ticket.buildingName || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 text-[var(--text-muted)]">
                  <Layers size={16} />
                  <span>{language === 'ar' ? 'الطابق' : 'Floor'}</span>
                </div>
                <span className="font-bold text-[var(--text-main)]">{ticket.floorName || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 text-[var(--text-muted)]">
                  <Hash size={16} />
                  <span>{language === 'ar' ? 'الغرفة' : 'Room'}</span>
                </div>
                <span className="font-bold text-[var(--text-main)]">{ticket.roomExtension || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Ticket Info */}
          <div className="premium-card p-6">
            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6">{language === 'ar' ? 'تفاصيل التذكرة' : 'Ticket Details'}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 text-[var(--text-muted)]">
                  <Tag size={16} />
                  <span>{language === 'ar' ? 'النوع' : 'Type'}</span>
                </div>
                {isAgent ? (
                  <select
                    value={ticket.ticketTypeId || ''}
                    onChange={(e) => handleUpdateTicketType(e.target.value)}
                    className="bg-transparent font-bold text-[var(--text-main)] outline-none border-b border-dashed border-[var(--border-main)] hover:border-primary-blue cursor-pointer"
                  >
                    <option value="">{language === 'ar' ? 'عام' : 'General'}</option>
                    {ticketTypes
                      .filter(tt => !tt.departmentId || tt.departmentId === ticket.departmentId)
                      .map(tt => <option key={tt.id} value={tt.id}>{language === 'ar' ? tt.nameAr : tt.nameEn}</option>)}
                  </select>
                ) : (
                  <span className="font-bold text-[var(--text-main)]">
                    {ticket.ticketType ? (language === 'ar' ? ticket.ticketType.nameAr : ticket.ticketType.nameEn) : 'General'}
                  </span>
                )}
              </div>
              {(ticket.status === 'resolved' || ticket.status === 'closed') && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3 text-[var(--text-muted)]">
                    <CheckCircle2 size={16} />
                    <span>{language === 'ar' ? 'نوع الحل' : 'Resolution'}</span>
                  </div>
                  <span className={`font-bold text-sm flex items-center gap-1 ${ticket.requiresExternalResource ? 'text-warning-amber' : 'text-success-green'}`}>
                    {ticket.requiresExternalResource ? (
                      <>{language === 'ar' ? 'خارجي' : 'External'}{ticket.externalResourceCost ? ` (${ticket.externalResourceCost})` : ''}</>
                    ) : (
                      <>{language === 'ar' ? 'داخلي' : 'Internal'}</>
                    )}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 text-[var(--text-muted)]">
                  <Clock size={16} />
                  <span>{language === 'ar' ? 'تاريخ الإنشاء' : 'Created At'}</span>
                </div>
                <span className="font-bold text-[var(--text-main)]">{new Date(ticket.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 text-[var(--text-muted)]">
                  <AlertCircle size={16} />
                  <span>{language === 'ar' ? 'الأولوية' : 'Priority'}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                  ticket.priority === 'urgent' ? 'bg-danger-red/10 text-danger-red dark:bg-danger-red/20' : 
                  ticket.priority === 'high' ? 'bg-orange-500/10 text-orange-500' :
                  'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                }`}>
                  {ticket.priority}
                </span>
              </div>
            </div>
          </div>

          {/* Due Date & Related Tickets */}
          <div className="premium-card p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{language === 'ar' ? 'موعد الاستحقاق' : 'Due Date'}</h3>
                {isAgent && (
                  <button 
                    onClick={() => {
                      setNewDueDate(ticket.dueDate ? new Date(ticket.dueDate).toISOString().split('T')[0] : '');
                      setShowDueDateModal(true);
                    }}
                    className="text-[10px] font-bold text-primary-blue hover:underline uppercase tracking-widest"
                  >
                    {language === 'ar' ? 'تعديل' : 'Edit'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ticket.dueDate && new Date(ticket.dueDate) < new Date() ? 'bg-danger-red/10 text-danger-red' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}>
                  <Clock size={20} />
                </div>
                <div>
                  <p className="font-bold text-[var(--text-main)]">
                    {ticket.dueDate ? new Date(ticket.dueDate).toLocaleDateString() : (language === 'ar' ? 'لم يحدد' : 'Not Set')}
                  </p>
                  {ticket.dueDate && new Date(ticket.dueDate) < new Date() && (
                    <p className="text-[10px] font-bold text-danger-red uppercase tracking-widest">{language === 'ar' ? 'متأخرة' : 'Overdue'}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-[var(--border-dim)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{language === 'ar' ? 'تذاكر ذات صلة' : 'Related Tickets'}</h3>
                {isAgent && (
                  <button 
                    onClick={() => setShowLinkModal(true)}
                    className="text-[10px] font-bold text-primary-blue hover:underline uppercase tracking-widest"
                  >
                    {language === 'ar' ? 'ربط تذكرة' : 'Link Ticket'}
                  </button>
                )}
              </div>
              
              <div className="space-y-3">
                {relatedTicketsData.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] italic">{language === 'ar' ? 'لا توجد تذاكر مرتبطة' : 'No related tickets'}</p>
                ) : relatedTicketsData.map(rt => (
                  <div key={rt.id} className="flex items-center justify-between group">
                    <button 
                      onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: `/tickets/${rt.id}` }))}
                      className="flex flex-col text-left hover:text-primary-blue transition-all"
                    >
                      <span className="text-xs font-mono font-bold text-primary-blue">{rt.ticketNumber}</span>
                      <span className="text-xs text-[var(--text-secondary)] line-clamp-1">{rt.subject}</span>
                    </button>
                    {isAgent && (
                      <button 
                        onClick={() => handleUnlinkTicket(rt.id)}
                        className="opacity-0 group-hover:opacity-100 text-danger-red p-1 hover:bg-danger-red/10 rounded transition-all"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Due Date Modal */}
      {showDueDateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="premium-card p-8 max-w-md w-full shadow-2xl"
          >
            <h3 className="text-xl font-bold text-[var(--text-main)] mb-6">
              {language === 'ar' ? 'تحديد موعد الاستحقاق' : 'Set Due Date'}
            </h3>
            <input 
              type="date" 
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--border-dim)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue mb-6"
            />
            <div className="flex gap-3">
              <button 
                onClick={() => setShowDueDateModal(false)}
                className="flex-1 px-6 py-3 rounded-xl font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-all"
              >
                {t.cancel}
              </button>
              <button 
                onClick={handleUpdateDueDate}
                className="flex-1 px-6 py-3 rounded-xl font-bold bg-primary-blue text-white hover:bg-blue-800 transition-all"
              >
                {t.save}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Link Ticket Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="premium-card p-8 max-w-lg w-full shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[var(--text-main)]">
                {language === 'ar' ? 'ربط تذكرة' : 'Link Ticket'}
              </h3>
              <button onClick={() => setShowLinkModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleLinkSearch} className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
              <input
                type="text"
                placeholder={language === 'ar' ? 'ابحث عن رقم التذكرة أو الموضوع...' : 'Search ticket # or subject...'}
                value={linkSearchTerm}
                onChange={(e) => setLinkSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--border-dim)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
              />
            </form>

            <div className="max-h-[300px] overflow-y-auto space-y-2 mb-6">
              {linkSearchResults.length === 0 ? (
                <p className="text-center py-8 text-[var(--text-muted)] text-sm italic">
                  {language === 'ar' ? 'لا توجد نتائج' : 'No results found'}
                </p>
              ) : linkSearchResults.map(res => (
                <div key={res.id} className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-dim)] hover:bg-[var(--border-dim)] transition-all">
                  <div className="flex flex-col">
                    <span className="text-xs font-mono font-bold text-primary-blue">{res.ticketNumber}</span>
                    <span className="text-sm text-[var(--text-secondary)] line-clamp-1">{res.subject}</span>
                  </div>
                  <button 
                    onClick={() => handleLinkTicket(res.id)}
                    className="bg-primary-blue/10 text-primary-blue px-3 py-1 rounded-lg text-xs font-bold hover:bg-primary-blue hover:text-white transition-all"
                  >
                    {language === 'ar' ? 'ربط' : 'Link'}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
