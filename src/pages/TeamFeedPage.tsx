import React, { useState, useEffect, useRef } from 'react';
import ErrorBanner from '../components/ErrorBanner.tsx';
import { useAuthStore } from '../store/authStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { translations } from '../core/translations.ts';
import { useNotifications } from '../core/NotificationProvider.tsx';
import { apiFetch } from '../core/api.ts';
import { 
  MessageSquare, 
  ThumbsUp, 
  Share2, 
  Mic, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  FileText, 
  Send, 
  MoreHorizontal,
  Paperclip,
  X,
  Smile,
  Users,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Author {
  id: number;
  fullNameAr: string;
  fullNameEn: string;
  avatarUrl: string | null;
}

interface Attachment {
  id: number;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  isVoiceNote: boolean;
  voiceDuration: number | null;
}

interface Comment {
  id: number;
  body: string;
  createdAt: string;
  author: Author;
}

interface Like {
  id: number;
  userId: number;
}

interface TeamNote {
  id: number;
  body: string;
  createdAt: string;
  author: Author;
  attachments: Attachment[];
  comments: Comment[];
  likes: Like[];
}

export default function TeamFeedPage() {
  const { user, accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];
  const { addNotification } = useNotifications();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNoteBody, setNewNoteBody] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [commentingOn, setCommentingOn] = useState<number | null>(null);
  const [newComment, setNewComment] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchNotes(controller.signal);
    
    // Cleanup interval and stream on unmount
    return () => {
      controller.abort();
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        if (mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
      }
    };
  }, []);

  const fetchNotes = async (signal?: AbortSignal) => {
    try {
      const data = await apiFetch('/api/team-notes', { signal });
      if (!signal?.aborted) setNotes(data);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err?.message || 'Something went wrong');
      console.error('Error fetching notes:', err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const data = await apiFetch('/api/uploads', {
        method: 'POST',
        body: formData
      });
      setAttachments([...attachments, { ...data, isVoiceNote: false }]);
    } catch (err) {
      setError(err?.message || 'Something went wrong');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      addNotification({
        title: t.microphoneErrorTitle,
        message: t.microphoneNotSupported,
        type: 'error'
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
        
        const formData = new FormData();
        formData.append('file', file);

        try {
          const data = await apiFetch('/api/uploads', {
            method: 'POST',
            body: formData
          });
          setAttachments([...attachments, { ...data, isVoiceNote: true, voiceDuration: recordingDuration }]);
        } catch (err) {
          setError(err?.message || 'Something went wrong');
          console.error('Voice upload error:', err);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      // Log as warning instead of error for expected hardware issues
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('device not found')) {
        console.warn('Microphone not found:', err.message);
      } else {
        console.error('Microphone access denied:', err);
      }

      let message = t.couldNotAccessMicrophone;
      
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('device not found')) {
        message = t.noMicrophoneFound;
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = t.microphonePermissionDenied;
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = t.microphoneInUse;
      }

      addNotification({
        title: t.microphoneErrorTitle,
        message,
        type: 'error'
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleCreateNote = async () => {
    if (!newNoteBody.trim() && attachments.length === 0) return;

    try {
      await apiFetch('/api/team-notes', {
        method: 'POST',
        body: JSON.stringify({
          body: newNoteBody,
          attachments
        })
      });

      setNewNoteBody('');
      setAttachments([]);
      fetchNotes();
    } catch (err) {
      setError(err?.message || 'Something went wrong');
      console.error('Error creating note:', err);
    }
  };

  const handleLike = async (noteId: number) => {
    try {
      await apiFetch(`/api/team-notes/${noteId}/like`, {
        method: 'POST'
      });
      fetchNotes();
    } catch (err) {
      setError(err?.message || 'Something went wrong');
      console.error('Error liking note:', err);
    }
  };

  const handleAddComment = async (noteId: number) => {
    if (!newComment.trim()) return;

    try {
      await apiFetch(`/api/team-notes/${noteId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: newComment })
      });

      setNewComment('');
      setCommentingOn(null);
      fetchNotes();
    } catch (err) {
      setError(err?.message || 'Something went wrong');
      console.error('Error adding comment:', err);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleShare = async (note: TeamNote) => {
    const shareData = {
      title: t.shareTeamPost,
      text: note.body,
      url: window.location.href + `?noteId=${note.id}`
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        addNotification({
          title: t.linkCopiedTitle,
          message: t.linkCopied,
          type: 'success'
        });
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong');
      console.error('Error sharing:', err);
    }
  };

  return (
    <>
    <ErrorBanner error={error} onRetry={() => { setError(null); fetchNotes(); }} onDismiss={() => setError(null)} />
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-3">
            <Users className="text-primary-blue" />
            {t.teamFeed}
          </h1>
          <p className="text-[var(--text-secondary)]">
            {t.teamFeedDesc}
          </p>
        </div>
      </div>

      {/* Create Post Card */}
      <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-main)] shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-slate-800 flex items-center justify-center border border-blue-100 dark:border-slate-700 overflow-hidden shrink-0">
              {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <Users className="text-primary-blue" size={20} />}
            </div>
            <textarea
              value={newNoteBody}
              onChange={(e) => setNewNoteBody(e.target.value)}
              placeholder={t.whatsOnYourMind}
              className="w-full bg-transparent border-none outline-none text-[var(--text-main)] placeholder-slate-400 resize-none min-h-[80px] py-2"
            />
          </div>

          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <div key={i} className="relative group bg-[var(--border-dim)] p-2 rounded-xl border border-[var(--border-main)] flex items-center gap-2">
                  {a.isVoiceNote ? <Mic size={14} className="text-rose-500" /> : <Paperclip size={14} className="text-primary-blue" />}
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] max-w-[100px] truncate">
                    {a.isVoiceNote ? `Voice Note (${formatDuration(a.voiceDuration)})` : a.fileName}
                  </span>
                  <button onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} className="text-[var(--text-muted)] hover:text-danger-red">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-[var(--border-dim)]/50 border-t border-[var(--border-dim)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="p-2 text-[var(--text-secondary)] hover:text-primary-blue hover:bg-primary-blue/10 rounded-full cursor-pointer transition-all">
              <input type="file" className="hidden" onChange={handleFileUpload} />
              <ImageIcon size={20} />
            </label>
            <label className="p-2 text-[var(--text-secondary)] hover:text-emerald-500 hover:bg-emerald-500/10 rounded-full cursor-pointer transition-all">
              <input type="file" className="hidden" onChange={handleFileUpload} />
              <Paperclip size={20} />
            </label>
            <button 
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2 rounded-full transition-all ${isRecording ? 'bg-rose-500 text-white animate-pulse' : 'text-[var(--text-secondary)] hover:text-rose-500 hover:bg-rose-500/10'}`}
            >
              <Mic size={20} />
            </button>
            {isRecording && <span className="text-xs font-mono text-rose-500 font-bold">{formatDuration(recordingDuration)}</span>}
          </div>
          <button
            onClick={handleCreateNote}
            disabled={!newNoteBody.trim() && attachments.length === 0}
            className="bg-primary-blue text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            {t.post}
          </button>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-6">
        {loading ? (
          <div className="p-8 text-center text-[var(--text-muted)]">Loading feed...</div>
        ) : notes.length === 0 ? (
          <div className="p-20 text-center bg-[var(--bg-surface)] rounded-3xl border border-dashed border-[var(--border-main)]">
            <Users size={48} className="mx-auto text-slate-200 mb-4" />
            <p className="text-[var(--text-muted)]">{t.noPostsYet}</p>
          </div>
        ) : (
          notes.map((note) => (
            <motion.div 
              key={note.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-main)] shadow-sm overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center overflow-hidden border border-[var(--border-main)]">
                      {note.author.avatarUrl ? <img src={note.author.avatarUrl} className="w-full h-full object-cover" /> : <User className="text-[var(--text-muted)]" size={20} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[var(--text-main)]">
                        {language === 'ar' ? note.author.fullNameAr : note.author.fullNameEn}
                      </h4>
                      <p className="text-[10px] text-[var(--text-muted)]">{new Date(note.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <button className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                    <MoreHorizontal size={20} />
                  </button>
                </div>

                <div className="text-[var(--text-secondary)] text-sm leading-relaxed whitespace-pre-wrap mb-4">
                  {note.body}
                </div>

                {/* Attachments */}
                {note.attachments.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {note.attachments.map((att) => (
                      <div key={att.id}>
                        {att.isVoiceNote ? (
                          <div className="bg-[var(--border-dim)]/50 p-3 rounded-2xl flex items-center gap-4 border border-[var(--border-dim)]">
                            <audio controls src={att.fileUrl} className="w-full h-10 rounded-xl" />
                            <span className="text-[10px] font-mono font-bold text-[var(--text-secondary)]">{formatDuration(att.voiceDuration || 0)}</span>
                          </div>
                        ) : att.mimeType?.startsWith('image/') ? (
                          <img src={att.fileUrl} className="rounded-2xl w-full max-h-96 object-cover border border-[var(--border-dim)]" />
                        ) : (
                          <a 
                            href={att.fileUrl} 
                            target="_blank" 
                            className="flex items-center gap-3 p-3 bg-[var(--border-dim)]/50 rounded-2xl border border-[var(--border-dim)] hover:bg-[var(--bg-elevated)] transition-all"
                          >
                            <div className="p-2 bg-[var(--bg-surface)] rounded-xl shadow-sm">
                              <FileText className="text-primary-blue" size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-[var(--text-secondary)] truncate">{att.fileName}</p>
                              <p className="text-[10px] text-[var(--text-muted)]">{(Number(att.fileSize) / 1024).toFixed(1)} KB</p>
                            </div>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-6 pt-4 border-t border-[var(--border-dim)]/50">
                  <button 
                    onClick={() => handleLike(note.id)}
                    className={`flex items-center gap-2 text-xs font-bold transition-all ${note.likes.some(l => l.userId === user?.id) ? 'text-primary-blue' : 'text-[var(--text-muted)] hover:text-primary-blue'}`}
                  >
                    <ThumbsUp size={18} className={note.likes.some(l => l.userId === user?.id) ? 'fill-current' : ''} />
                    {note.likes.length} {t.likes}
                  </button>
                  <button 
                    onClick={() => setCommentingOn(commentingOn === note.id ? null : note.id)}
                    className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] hover:text-primary-blue transition-all"
                  >
                    <MessageSquare size={18} />
                    {note.comments.length} {t.comments}
                  </button>
                  <button 
                    onClick={() => handleShare(note)}
                    className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] hover:text-primary-blue transition-all"
                  >
                    <Share2 size={18} />
                    {t.share}
                  </button>
                </div>
              </div>

              {/* Comments Section */}
              <AnimatePresence>
                {(commentingOn === note.id || note.comments.length > 0) && (
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="bg-[var(--border-dim)]/30 border-t border-[var(--border-dim)] overflow-hidden"
                  >
                    <div className="p-6 space-y-4">
                      {note.comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] shrink-0 overflow-hidden">
                            {comment.author.avatarUrl ? <img src={comment.author.avatarUrl} className="w-full h-full object-cover" /> : <User size={16} className="m-2 text-[var(--text-muted)]" />}
                          </div>
                          <div className="flex-1 bg-[var(--bg-surface)] p-3 rounded-2xl shadow-sm border border-[var(--border-dim)]">
                            <div className="flex items-center justify-between mb-1">
                              <h5 className="text-xs font-bold text-[var(--text-main)]">
                                {language === 'ar' ? comment.author.fullNameAr : comment.author.fullNameEn}
                              </h5>
                              <span className="text-[9px] text-[var(--text-muted)]">{new Date(comment.createdAt).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)]">{comment.body}</p>
                          </div>
                        </div>
                      ))}

                      <div className="flex gap-3 pt-2">
                        <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-slate-700 shrink-0 flex items-center justify-center border border-blue-100 dark:border-slate-600">
                          {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover rounded-full" /> : <User size={16} className="text-primary-blue" />}
                        </div>
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={commentingOn === note.id ? newComment : ''}
                            onChange={(e) => {
                              setCommentingOn(note.id);
                              setNewComment(e.target.value);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddComment(note.id)}
                            placeholder={t.writeComment}
                            className="w-full bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-xl px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-blue"
                          />
                          <button 
                            onClick={() => handleAddComment(note.id)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-blue hover:scale-110 transition-transform"
                          >
                            <Send size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))
        )}
      </div>
    </div>
    </>
  );
}
