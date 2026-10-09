import Image from 'next/image';
import { LogOut, UserRound } from 'lucide-react';
import { AppPanel } from '@/components/app/shared/AppPage';
import type { SettingsUser } from './types';

export function AccountSettingsSection({
  user,
  onSignOut,
}: {
  user: SettingsUser | null | undefined;
  onSignOut: () => void;
}) {
  return (
    <AppPanel className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="icon-chip h-12 w-12 rounded-[18px]">
          <UserRound className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Account</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Signed-in identity and account access.
          </p>
        </div>
      </div>

      <div className="rounded-[22px] border border-white/10 bg-[rgba(8,17,30,0.42)] p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] border border-white/10 bg-[rgba(93,166,255,0.12)]">
            {user?.image ? (
              <Image
                src={user.image}
                alt="User avatar"
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-white">
                {(user?.name ?? 'GG')
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase()}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">
              {user?.name || 'Guest User'}
            </p>
            <p className="truncate text-sm text-[var(--text-secondary)]">
              {user?.email || 'No email available'}
            </p>
            <p className="mt-1 break-all text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
              User ID: {user?.id || 'Unavailable'}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="app-button-secondary" onClick={onSignOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </AppPanel>
  );
}
