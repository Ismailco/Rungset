'use client';

import AlertModal from '@/components/common/AlertModal';
import { AccountSettingsSection } from '@/components/app/settings/AccountSettingsSection';
import { NotificationsOfflineSection } from '@/components/app/settings/NotificationsOfflineSection';
import { WorkspaceBehaviorSection } from '@/components/app/settings/WorkspaceBehaviorSection';
import { WorkspaceDataSection } from '@/components/app/settings/WorkspaceDataSection';
import { AppPage } from '@/components/app/shared/AppPage';
import { useSettingsController } from './useSettingsController';

export default function SettingsPage() {
  const settings = useSettingsController();

  return (
    <AppPage>
      <header className="flex flex-col gap-3 border-b border-[var(--border-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-description">Manage your Rungset preferences.</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Workspace status">
          <span className={`app-pill ${settings.isOnline ? 'app-pill-success' : 'app-pill-warning'}`}>
            {settings.isOnline ? 'Online' : 'Offline'}
          </span>
          <span className="app-pill app-pill-blue">
            {settings.notificationStatusLabel} notifications
          </span>
          <span className={`app-pill ${settings.pwaCacheReady ? 'app-pill-success' : 'app-pill-warning'}`}>
            {settings.pwaCacheReady ? 'Offline cache ready' : 'Offline cache not ready'}
          </span>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <AccountSettingsSection
          user={settings.sessionUser}
          onSignOut={settings.handleSignOut}
        />
        <WorkspaceBehaviorSection
          settings={settings.settings}
          sidebarCollapsed={settings.sidebarCollapsed}
          onSidebarCollapsedChange={settings.handleSidebarCollapsedChange}
          onSettingsChange={settings.updateSettings}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <NotificationsOfflineSection
          notificationPermission={settings.notificationPermission}
          notificationStatusLabel={settings.notificationStatusLabel}
          pwaCacheReady={settings.pwaCacheReady}
          isCaching={settings.isCaching}
          onEnableNotifications={settings.handleEnableNotifications}
          onCacheWorkspace={settings.handleCacheWorkspace}
        />
        <WorkspaceDataSection
          counts={settings.counts}
          totalItems={settings.totalItems}
          isExporting={settings.isExporting}
          isClearingCache={settings.isClearingCache}
          isResettingData={settings.isResettingData}
          onExportWorkspace={settings.handleExportWorkspace}
          onRequestClearLocalCache={settings.onRequestClearLocalCache}
          onRequestWorkspaceReset={settings.onRequestWorkspaceReset}
        />
      </div>

      {settings.alert.show ? (
        <AlertModal
          title={settings.alert.title}
          message={settings.alert.message}
          type={settings.alert.type}
          onClose={settings.closeAlert}
          isConfirmation={settings.alert.isConfirmation}
          onConfirm={settings.alert.onConfirm}
        />
      ) : null}
    </AppPage>
  );
}
