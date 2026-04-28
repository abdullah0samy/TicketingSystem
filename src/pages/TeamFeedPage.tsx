import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
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
  Play,
  Pause,
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
  const { addNotification } = useNotifications();
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
      setNotes(data);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
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
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      addNotification({
        title: language === 'ar' ? 'خطأ في الميكروفون' : 'Microphone Error',
        message: language === 'ar' ? 'متصفحك لا يدعم تسجيل الصوت' : 'Your browser does not support audio recording',
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

      let message = language === 'ar' ? 'تعذر الوصول إلى الميكروفون' : 'Could not access microphone';
      
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('device not found')) {
        message = language === 'ar' ? 'لم يتم العثور على ميكروفون متصل. يرجى التأكد من توصيل الميكروفون.' : 'No microphone device found. Please ensure a microphone is connected.';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = language === 'ar' ? 'تم رفض الإذن بالوصول للميكروفون. يرجى تفعيل الإذن من إعدادات المتصفح.' : 'Microphone permission denied. Please enable it in your browser settings.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = language === 'ar' ? 'الميكروفون مستخدم بالفعل من قبل تطبيق آخر.' : 'Microphone is already in use by another application.';
      }

      addNotification({
        title: language === 'ar' ? 'خطأ في الميكروفون' : 'Microphone Error',
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
      title: language === 'ar' ? 'مشاركة منشور الفريق' : 'Share Team Post',
      text: note.body,
      url: window.location.href + `?noteId=${note.id}`
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        addNotification({
          title: language === 'ar' ? 'تم النسخ' : 'Link Copied',
          message: language === 'ar' ? 'تم نسخ رابط المنشور إلى الحافظة' : 'Post link copied to clipboard',
          type: 'success'
        });
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Users className="text-primary-blue" />
            {language === 'ar' ? 'ساحة الفريق' : 'Team Feed'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {language === 'ar' ? 'شارك المعرفة والتحديثات مع زملائك' : 'Share knowledge and updates with your colleagues'}
          </p>
        </div>
      </div>

      {/* Create Post Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-slate-800 flex items-center justify-center border border-blue-100 dark:border-slate-700 overflow-hidden shrink-0">
              {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <Users className="text-primary-blue" size={20} />}
            </div>
            <textarea
              value={newNoteBody}
              onChange={(e) => setNewNoteBody(e.target.value)}
              placeholder={language === 'ar' ? 'بماذا تفكر؟' : "What's on your mind?"}
              className="w-full bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder-slate-400 resize-none min-h-[80px] py-2"
            />
          </div>

          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <div key={i} className="relative group bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-2">
                  {a.isVoiceNote ? <Mic size={14} className="text-rose-500" /> : <Paperclip size={14} className="text-primary-blue" />}
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 max-w-[100px] truncate">
                    {a.isVoiceNote ? `Voice Note (${formatDuration(a.voiceDuration)})` : a.fileName}
                  </span>
                  <button onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-danger-red">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="p-2 text-slate-500 hover:text-primary-blue hover:bg-primary-blue/10 rounded-full cursor-pointer transition-all">
              <input type="file" className="hidden" onChange={handleFileUpload} />
              <ImageIcon size={20} />
            </label>
            <label className="p-2 text-slate-500 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-full cursor-pointer transition-all">
              <input type="file" className="hidden" onChange={handleFileUpload} />
              <Paperclip size={20} />
            </label>
            <button 
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2 rounded-full transition-all ${isRecording ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-500 hover:text-rose-500 hover:bg-rose-500/10'}`}
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
            {language === 'ar' ? 'نشر' : 'Post'}
          </button>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-6">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading feed...</div>
        ) : notes.length === 0 ? (
          <div className="p-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
            <Users size={48} className="mx-auto text-slate-200 mb-4" />
            <p className="text-slate-400">{language === 'ar' ? 'لا توجد منشورات بعد' : 'No posts yet'}</p>
          </div>
        ) : (
          notes.map((note) => (
            <motion.div 
              key={note.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                      {note.author.avatarUrl ? <img src={note.author.avatarUrl} className="w-full h-full object-cover" /> : <User className="text-slate-400" size={20} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {language === 'ar' ? note.author.fullNameAr : note.author.fullNameEn}
                      </h4>
                      <p className="text-[10px] text-slate-400">{new Date(note.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <button className="text-slate-400 hover:text-slate-600">
                    <MoreHorizontal size={20} />
                  </button>
                </div>

                <div className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap mb-4">
                  {note.body}
                </div>

                {/* Attachments */}
                {note.attachments.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {note.attachments.map((att) => (
                      <div key={att.id}>
                        {att.isVoiceNote ? (
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl flex items-center gap-4 border border-slate-100 dark:border-slate-800">
                            <button className="w-10 h-10 rounded-full bg-primary-blue text-white flex items-center justify-center hover:scale-105 transition-transform">
                              <Play size={18} fill="currentColor" />
                            </button>
                            <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden relative">
                              <div className="absolute inset-0 bg-primary-blue w-1/3" />
                            </div>
                            <span className="text-[10px] font-mono font-bold text-slate-500">{formatDuration(att.voiceDuration || 0)}</span>
                          </div>
                        ) : att.mimeType?.startsWith('image/') ? (
                          <img src={att.fileUrl} className="rounded-2xl w-full max-h-96 object-cover border border-slate-100 dark:border-slate-800" />
                        ) : (
                          <a 
                            href={att.fileUrl} 
                            target="_blank" 
                            className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-slate-100 transition-all"
                          >
                            <div className="p-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm">
                              <FileText className="text-primary-blue" size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{att.fileName}</p>
                              <p className="text-[10px] text-slate-400">{(Number(att.fileSize) / 1024).toFixed(1)} KB</p>
                            </div>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-6 pt-4 border-t border-slate-50 dark:border-slate-800/50">
                  <button 
                    onClick={() => handleLike(note.id)}
                    className={`flex items-center gap-2 text-xs font-bold transition-all ${note.likes.some(l => l.userId === user?.id) ? 'text-primary-blue' : 'text-slate-400 hover:text-primary-blue'}`}
                  >
                    <ThumbsUp size={18} className={note.likes.some(l => l.userId === user?.id) ? 'fill-current' : ''} />
                    {note.likes.length} {language === 'ar' ? 'إعجاب' : 'Likes'}
                  </button>
                  <button 
                    onClick={() => setCommentingOn(commentingOn === note.id ? null : note.id)}
                    className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-primary-blue transition-all"
                  >
                    <MessageSquare size={18} />
                    {note.comments.length} {language === 'ar' ? 'تعليق' : 'Comments'}
                  </button>
                  <button 
                    onClick={() => handleShare(note)}
                    className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-primary-blue transition-all"
                  >
                    <Share2 size={18} />
                    {language === 'ar' ? 'مشاركة' : 'Share'}
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
                    className="bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 overflow-hidden"
                  >
                    <div className="p-6 space-y-4">
                      {note.comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0 overflow-hidden">
                            {comment.author.avatarUrl ? <img src={comment.author.avatarUrl} className="w-full h-full object-cover" /> : <User size={16} className="m-2 text-slate-400" />}
                          </div>
                          <div className="flex-1 bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <div className="flex items-center justify-between mb-1">
                              <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                                {language === 'ar' ? comment.author.fullNameAr : comment.author.fullNameEn}
                              </h5>
                              <span className="text-[9px] text-slate-400">{new Date(comment.createdAt).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400">{comment.body}</p>
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
                            placeholder={language === 'ar' ? 'اكتب تعليقاً...' : 'Write a comment...'}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-blue"
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
  );
}
