import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/authStore.ts';
import { useSettingsStore } from '../../store/settingsStore.ts';
import { translations } from '../../core/translations.ts';
import { apiFetch } from '../../core/api.ts';
import { Send, Building2, Layers, Users, Tag, AlertCircle, CheckCircle2, Phone, Hash, Paperclip, X, File as FileIcon, Mic, MicOff } from 'lucide-react';
import { motion } from 'motion/react';

interface Building { id: number; nameAr: string; nameEn: string; }
interface Floor { id: number; nameAr: string; nameEn: string; buildingId: number; }
interface Department { id: number; nameAr: string; nameEn: string; deptType: string; }
interface TicketType { id: number; nameAr: string; nameEn: string; departmentId: number | null; color: string; }
interface Asset { id: number; name: string; serialNumber: string | null; }

interface Attachment {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

export default function NewTicketPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    departmentId: '',
    ticketTypeId: '',
    priority: 'normal',
    buildingId: '',
    floorId: '',
    assetId: '',
    roomExtension: '',
    creatorPhone: '',
    creatorExtension: ''
  });

  const { accessToken, user } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];
  const isMounted = useRef(true);
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      isMounted.current = false;
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

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const data = await apiFetch('/api/tickets/form-data');
      if (!isMounted.current) return;
      setBuildings(data.buildings);
      setDepartments(data.departments.filter((d: any) => d.deptType === 'RECEIVER_ONLY' || d.deptType === 'BOTH'));
      setTicketTypes(data.ticketTypes);
      // Assets are only available to staff roles
      if (user && user.role !== 'end_user') {
        try {
          const aData = await apiFetch('/api/assets');
          if (isMounted.current) setAssets(aData.filter((a: any) => a.status === 'active'));
        } catch { /* non-staff: skip assets silently */ }
      }
    } catch (err) {
      if (!isMounted.current) return;
      console.error('Error fetching initial data:', err);
      setError('Failed to load initial data. Please refresh the page.');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (formData.buildingId) {
      apiFetch('/api/tickets/form-data')
        .then(data => {
          setFloors(data.floors.filter((f: any) => f.buildingId === parseInt(formData.buildingId)));
        })
        .catch(err => console.error('Error fetching floors:', err));
    } else {
      setFloors([]);
    }
  }, [formData.buildingId]);

  // Debounced KB suggestion search on subject/description change
  useEffect(() => {
    const query = `${formData.subject} ${formData.description}`.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch(`/api/knowledge/suggest?q=${encodeURIComponent(query)}`);
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch { setSuggestions([]); }
    }, 300);
    return () => { if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current); };
  }, [formData.subject, formData.description]);

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
      setAttachments([...attachments, data]);
    } catch (err: any) {
      setError(err.message || 'File upload error');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError(t.microphoneNotSupported);
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
          setAttachments([...attachments, { ...data, isVoiceNote: true, voiceDuration: recordingDuration } as any]);
        } catch (err: any) {
          setError(err.message || t.uploadFailed);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      let message = t.couldNotAccessMicrophone;
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('device not found')) {
        message = t.noMicrophoneFound;
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = t.microphonePermissionDenied;
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = t.microphoneInUse;
      }
      setError(message);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await apiFetch('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({ ...formData, attachments })
      });

      setSuccess(t.ticketCreatedSuccess.replace('{ticketNumber}', data.ticketNumber));
      navigateTimerRef.current = setTimeout(() => window.dispatchEvent(new CustomEvent('navigate', { detail: '/inbox' })), 1500);
      setAttachments([]);
      setFormData({
        subject: '',
        description: '',
        departmentId: '',
        ticketTypeId: '',
        priority: 'normal',
        buildingId: '',
        floorId: '',
        assetId: '',
        roomExtension: '',
        creatorPhone: '',
        creatorExtension: ''
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-[var(--text-muted)]">{t.loading}</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-main)]">
          {t.openNewTicket}
        </h2>
        <p className="text-[var(--text-secondary)]">
          {t.newTicketSubtitle}
        </p>
      </div>

      {success && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 bg-success-green/10 border border-success-green/20 text-success-green rounded-2xl flex items-center gap-3 font-bold">
          <CheckCircle2 size={24} />
          {success}
        </motion.div>
      )}

      {error && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 bg-danger-red/10 border border-danger-red/20 text-danger-red rounded-2xl flex items-center gap-3 font-bold">
          <AlertCircle size={24} />
          {error}
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Location Section */}
        <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 text-primary-blue">
            <Building2 size={20} />
            <h3 className="font-bold uppercase tracking-widest text-xs">{t.location}</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                {t.building} <span className="text-danger-red">*</span>
              </label>
              <select
                value={formData.buildingId}
                required
                onChange={(e) => setFormData({ ...formData, buildingId: e.target.value, floorId: '' })}
                className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
              >
                <option value="">{t.selectBuilding}</option>
                {buildings.map(b => <option key={b.id} value={b.id}>{language === 'ar' ? b.nameAr : b.nameEn}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                {t.floor} <span className="text-danger-red">*</span>
              </label>
              <select
                value={formData.floorId}
                disabled={!formData.buildingId}
                required
                onChange={(e) => setFormData({ ...formData, floorId: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue disabled:opacity-50"
              >
                <option value="">{t.selectFloor}</option>
                {floors.map(f => <option key={f.id} value={f.id}>{language === 'ar' ? f.nameAr : f.nameEn}</option>)}
              </select>
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">{t.relatedAsset}</label>
              <select
                value={formData.assetId}
                onChange={(e) => setFormData({ ...formData, assetId: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
              >
                <option value="">{t.selectAssetOptional}</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name} ({a.serialNumber})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">{t.room}</label>
              <input
                type="text"
                value={formData.roomExtension}
                onChange={(e) => setFormData({ ...formData, roomExtension: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                placeholder="e.g. Room 402"
              />
            </div>
          </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 text-primary-blue">
            <Phone size={20} />
            <h3 className="font-bold uppercase tracking-widest text-xs">{t.contactInfo}</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">{t.phone}</label>
              <input
                type="text"
                value={formData.creatorPhone}
                onChange={(e) => setFormData({ ...formData, creatorPhone: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                placeholder="05xxxxxxxx"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                {t.extension} <span className="text-danger-red">*</span>
              </label>
              <input
                type="text"
                value={formData.creatorExtension}
                required
                onChange={(e) => setFormData({ ...formData, creatorExtension: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                placeholder="e.g. 1234"
              />
            </div>
          </div>
        </div>

        {/* Issue Details Section */}
        <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-main)] p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 text-primary-blue">
            <AlertCircle size={20} />
            <h3 className="font-bold uppercase tracking-widest text-xs">{t.issueDetails}</h3>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                  {t.targetDepartment} <span className="text-danger-red">*</span>
                </label>
                <select
                  value={formData.departmentId}
                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value, ticketTypeId: '' })}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                  required
                >
                  <option value="">{t.selectDepartment}</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{language === 'ar' ? d.nameAr : d.nameEn}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                  {t.issueType}
                </label>
                <select
                  value={formData.ticketTypeId}
                  onChange={(e) => setFormData({ ...formData, ticketTypeId: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                >
                  <option value="">{t.selectTypeOptional}</option>
                  {ticketTypes
                    .filter(tt => !tt.departmentId || tt.departmentId === parseInt(formData.departmentId))
                    .map(tt => <option key={tt.id} value={tt.id}>{language === 'ar' ? tt.nameAr : tt.nameEn}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">{t.priority}</label>
              <div className="grid grid-cols-4 gap-4">
                {['low', 'normal', 'high', 'critical'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setFormData({ ...formData, priority: p })}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
                      formData.priority === p 
                        ? (p === 'critical' ? 'bg-danger-red text-white border-danger-red' : 'bg-primary-blue text-white border-primary-blue')
                        : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-main)]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                {t.subject} <span className="text-danger-red">*</span>
              </label>
              <input
                type="text"
                value={formData.subject}
                required
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue"
                placeholder={t.subjectPlaceholder}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                {t.detailedDescription} <span className="text-danger-red">*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                onFocus={() => setShowSuggestions(suggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue min-h-[150px]"
                placeholder={t.descriptionPlaceholder}
                required
              />
              {showSuggestions && (
                <div className="mt-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] shadow-xl overflow-hidden">
                  <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-dim)]">
                    {language === 'ar' ? 'مقالات مقترحة' : 'Suggested Articles'}
                  </div>
                  {suggestions.map((a: any) => (
                    <a
                      key={a.id}
                      href={`/knowledge`}
                      onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate', { detail: '/knowledge' })); }}
                      className="block px-4 py-3 hover:bg-[var(--border-dim)] transition-all border-b border-[var(--border-dim)] last:border-0"
                    >
                      <p className="text-sm font-bold text-[var(--text-main)]">{language === 'ar' ? a.titleAr : a.titleEn}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">{language === 'ar' ? a.snippetAr : a.snippetEn}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">{t.attachments}</label>
              <div className="flex flex-wrap gap-4">
                {attachments.map((file, idx) => (
                  <div key={idx} className="relative group bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-main)] flex items-center gap-3">
                    {(file as any).isVoiceNote ? <Mic size={20} className="text-rose-500" /> : <FileIcon size={20} className="text-primary-blue" />}
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-[var(--text-secondary)] line-clamp-1 max-w-[150px]">
                        {(file as any).isVoiceNote ? `${t.voiceNote} (${formatDuration((file as any).voiceDuration || 0)})` : file.fileName}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">{(file.fileSize / 1024).toFixed(1)} KB</span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-danger-red text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                
                <label className="w-32 h-20 border-2 border-dashed border-[var(--border-main)] rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary-blue hover:bg-primary-blue/5 transition-all text-[var(--text-muted)] hover:text-primary-blue">
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                  <Paperclip size={20} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">{uploading ? '...' : t.attach}</span>
                </label>
                
                <button
                  type="button"
                  onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                  disabled={uploading}
                  className={`w-32 h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                    isRecording
                      ? 'border-rose-500 bg-rose-500/10 text-rose-500 animate-pulse'
                      : 'border-[var(--border-main)] text-[var(--text-muted)] hover:border-rose-500 hover:bg-rose-500/5 hover:text-rose-500'
                  }`}
                >
                  {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {isRecording ? formatDuration(recordingDuration) : t.record}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 bg-primary-blue text-white px-8 py-4 rounded-2xl font-bold hover:bg-blue-800 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
          >
            {submitting ? '...' : (
              <>
                <Send size={20} />
                {t.submitTicket}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
