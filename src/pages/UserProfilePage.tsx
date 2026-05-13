import React from 'react';
import { useAuthStore } from '../store/authStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { User, Mail, Phone, Building2, Shield } from 'lucide-react';

/**
 * UserProfilePage — Displays the currently logged-in user's profile.
 * This is a stub implementation; expand as needed.
 */
export default function UserProfilePage() {
  const { user } = useAuthStore();
  const { language } = useSettingsStore();

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-[var(--text-main)] mb-8 flex items-center gap-3">
        <User className="text-primary-blue" />
        {language === 'ar' ? 'الملف الشخصي' : 'My Profile'}
      </h2>

      <div className="premium-card p-8 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-primary-blue/10 flex items-center justify-center text-3xl font-bold text-primary-blue">
            {language === 'ar'
              ? (user.fullNameAr?.[0] ?? '?')
              : (user.fullNameEn?.[0] ?? '?')}
          </div>
          <div>
            <h3 className="text-xl font-bold text-[var(--text-main)]">
              {language === 'ar' ? user.fullNameAr : user.fullNameEn}
            </h3>
            <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-primary-blue bg-primary-blue/10 px-3 py-1 rounded-full mt-1">
              <Shield size={12} />
              {user.role?.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-[var(--border-dim)]">
          {user.email && (
            <div className="flex items-center gap-3 text-[var(--text-secondary)]">
              <Mail size={16} className="text-[var(--text-muted)]" />
              <span className="text-sm">{user.email}</span>
            </div>
          )}
          {user.department && (
            <div className="flex items-center gap-3 text-[var(--text-secondary)]">
              <Building2 size={16} className="text-[var(--text-muted)]" />
              <span className="text-sm">
                {language === 'ar' ? user.department.nameAr : user.department.nameEn}
              </span>
            </div>
          )}
          {user.badgeNumber && (
            <div className="flex items-center gap-3 text-[var(--text-secondary)]">
              <User size={16} className="text-[var(--text-muted)]" />
              <span className="text-sm font-mono">{user.badgeNumber}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
