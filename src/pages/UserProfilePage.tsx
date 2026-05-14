import React, { useState, useEffect } from 'react';
import ErrorBanner from '../components/ErrorBanner.tsx';
import { useAuthStore } from '../store/authStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { translations } from '../core/translations.ts';
import { apiFetch } from '../core/api.ts';
import { User, Shield, Camera, Upload } from 'lucide-react';

export default function UserProfilePage() {
  const { user: authUser, setAuth } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  const [user, setUser] = useState(authUser);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [about, setAbout] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/profile');
      setUser(data);
      setAbout(data.about || '');
      setAuth(data, useAuthStore.getState().accessToken!);
    } catch (err: any) {
      setError(err?.message || 'Failed to load profile');
      console.error('Error loading profile:', err);
      if (authUser) {
        setUser(authUser);
        setAbout(authUser.about || '');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const hasChanges = avatarFile !== null || about !== (user?.about || '');

  const handleSave = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    setSaved(false);

    try {
      const body: Record<string, string> = {};

      if (avatarFile) {
        const formData = new FormData();
        formData.append('file', avatarFile);
        const uploadResult = await apiFetch('/api/uploads', {
          method: 'POST',
          body: formData,
        });
        body.avatarUrl = uploadResult.fileUrl;
      }

      if (about !== (user?.about || '')) {
        body.about = about;
      }

      const updatedUser = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(body),
      });

      setUser(updatedUser);
      setAvatarFile(null);
      setAvatarPreview(null);
      setSaved(true);
      setAuth(updatedUser, useAuthStore.getState().accessToken!);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save profile');
      console.error('Error saving profile:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-[var(--text-muted)]">Loading profile...</div>;

  if (!user) return null;

  const avatarSrc = avatarPreview || user.avatarUrl;
  const displayName = language === 'ar' ? user.fullNameAr : user.fullNameEn;

  return (
    <>
    <ErrorBanner error={error} onRetry={() => { setError(null); loadProfile(); }} onDismiss={() => setError(null)} />
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-[var(--text-main)] mb-8 flex items-center gap-3">
        <User className="text-primary-blue" />
        {t.myProfile}
      </h2>

      <div className="premium-card p-8 space-y-6">
        {/* Avatar with upload overlay */}
        <div className="flex items-center gap-6">
          <div className="relative group">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                className="w-20 h-20 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-primary-blue/10 flex items-center justify-center text-3xl font-bold text-primary-blue">
                {(language === 'ar' ? user.fullNameAr?.[0] : user.fullNameEn?.[0]) ?? '?'}
              </div>
            )}
            <label className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
              <Camera className="text-white" size={24} />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </label>
          </div>
          <div>
            <h3 className="text-xl font-bold text-[var(--text-main)]">
              {displayName}
            </h3>
            <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-primary-blue bg-primary-blue/10 px-3 py-1 rounded-full mt-1">
              <Shield size={12} />
              {user.role?.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Read-only admin-set fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-[var(--border-dim)]">
          <Field label={t.nameArabic} value={user.fullNameAr} />
          <Field label={t.nameEnglish} value={user.fullNameEn} />
          <Field label={t.staffId} value={user.badgeNumber} />
          <Field label={t.role} value={user.role?.replace('_', ' ')} />
          <Field
            label={t.department}
            value={user.department
              ? language === 'ar'
                ? user.department.nameAr
                : user.department.nameEn
              : ''}
          />
          <Field label={t.username} value={user.username} />
        </div>

        {/* Editable about / bio */}
        <div className="pt-6 border-t border-[var(--border-dim)]">
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
            {t.about}
          </label>
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder={t.aboutPlaceholder}
            rows={3}
            className="w-full rounded-lg border border-[var(--border-dim)] bg-[var(--bg-main)] px-4 py-2.5 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-primary-blue/50 resize-none"
          />
        </div>

        {/* Save / success */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Upload size={16} />
            {saving ? t.saving : t.save}
          </button>
          {saved && (
            <span className="text-sm text-green-500 font-medium">
              {t.profileUpdated}
            </span>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <span className="text-sm text-[var(--text-main)]">{value}</span>
    </div>
  );
}
