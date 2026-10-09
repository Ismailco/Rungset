import { Bell, CloudDownload } from 'lucide-react';
import { AppPanel } from '@/components/app/shared/AppPage';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import type { NotificationPermissionState } from './types';

export function NotificationsOfflineSection({
  notificationPermission,
  notificationStatusLabel,
  pwaCacheReady,
  isCaching,
  onEnableNotifications,
  onCacheWorkspace,
}: {
  notificationPermission: NotificationPermissionState;
  notificationStatusLabel: string;
  pwaCacheReady: boolean;
  isCaching: boolean;
  onEnableNotifications: () => void;
  onCacheWorkspace: () => void;
}) {
  return (
    <AppPanel className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="icon-chip h-12 w-12 rounded-[18px]">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Notifications & offline</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Browser permission and offline readiness for the app shell.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[20px] border border-white/10 bg-[rgba(8,17,30,0.42)] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">Desktop notifications</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Current permission: {notificationStatusLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={onEnableNotifications}
              disabled={
                notificationPermission === 'granted' ||
                notificationPermission === 'unsupported'
              }
              className="app-button disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Bell className="h-4 w-4" />
              Enable
            </button>
          </div>
        </div>

        <div className="rounded-[20px] border border-white/10 bg-[rgba(8,17,30,0.42)] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">Offline cache</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {pwaCacheReady
                  ? 'Core pages have been cached for offline access.'
                  : 'Prepare the app shell so the core pages are available offline.'}
              </p>
            </div>

            <button
              type="button"
              onClick={onCacheWorkspace}
              disabled={isCaching}
              className="app-button disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCaching ? <LoadingSpinner size="small" /> : <CloudDownload className="h-4 w-4" />}
              Cache now
            </button>
          </div>
        </div>
      </div>
    </AppPanel>
  );
}
