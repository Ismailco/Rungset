import { useEffect, useMemo, useState } from 'react';
import { useNotification } from '@/app/providers/NotificationProvider';
import { cacheAppPages } from '@/app/providers/ServiceWorkerProvider';
import {
  DEFAULT_APP_SETTINGS,
  readAppSettings,
  readPwaCacheReady,
  readSidebarCollapsed,
  subscribeToAppSettings,
  writeAppSettings,
  writePwaCacheReady,
  writeSidebarCollapsed,
  type AppSettings,
} from '@/lib/app-settings';
import { signOut, useSession } from '@/lib/auth/auth-client';
import {
  clearUserCache,
  clearOfflineCaches,
  deleteCheckIn,
  deleteGoal,
  deleteMilestone,
  deleteNote,
  deleteTodo,
  getCheckIns,
  getGoals,
  getMilestones,
  getNotes,
  getTodos,
  getWorkspaceExport,
  importWorkspaceData,
} from '@/lib/storage';
import { WORKSPACE_SYNC_EVENT } from '@/lib/workspace-sync-events';
import type {
  NotificationPermissionState,
  SettingsAlert,
  WorkspaceCounts,
} from '@/components/app/settings/types';

const EMPTY_COUNTS: WorkspaceCounts = {
  checkIns: 0,
  goals: 0,
  milestones: 0,
  notes: 0,
  todos: 0,
};

export function useSettingsController() {
  const { data: session } = useSession();
  const { hasPermission, requestPermission } = useNotification();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pwaCacheReady, setPwaCacheReady] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>('default');
  const [counts, setCounts] = useState<WorkspaceCounts>(EMPTY_COUNTS);
  const [isOnline, setIsOnline] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCaching, setIsCaching] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isResettingData, setIsResettingData] = useState(false);
  const [alert, setAlert] = useState<SettingsAlert>({
    show: false,
    title: '',
    message: '',
    type: 'info',
  });

  async function loadWorkspaceCounts() {
    const [goals, milestones, notes, todos, checkIns] = await Promise.all([
      getGoals(),
      getMilestones(),
      getNotes(),
      getTodos(),
      getCheckIns(),
    ]);

    setCounts({
      checkIns: checkIns.length,
      goals: goals.length,
      milestones: milestones.length,
      notes: notes.length,
      todos: todos.length,
    });
  }

  useEffect(() => {
    const syncSettings = () => {
      setSettings(readAppSettings());
      setSidebarCollapsed(readSidebarCollapsed());
      setPwaCacheReady(readPwaCacheReady());
      setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine);

      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotificationPermission(Notification.permission);
      } else {
        setNotificationPermission('unsupported');
      }
    };

    syncSettings();
    void loadWorkspaceCounts();

    const unsubscribe = subscribeToAppSettings(syncSettings);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(WORKSPACE_SYNC_EVENT, loadWorkspaceCounts);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(WORKSPACE_SYNC_EVENT, loadWorkspaceCounts);
    };
  }, []);

  useEffect(() => {
    if (hasPermission) {
      setNotificationPermission('granted');
    }
  }, [hasPermission]);

  const totalItems = useMemo(
    () =>
      counts.goals +
      counts.milestones +
      counts.notes +
      counts.todos +
      counts.checkIns,
    [counts],
  );

  function updateSettings(nextPartial: Partial<AppSettings>) {
    const nextSettings = writeAppSettings(nextPartial);
    setSettings(nextSettings);
  }

  function handleSidebarCollapsedChange(collapsed: boolean) {
    writeSidebarCollapsed(collapsed);
    setSidebarCollapsed(collapsed);
  }

  function downloadJsonFile(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportWorkspace() {
    setIsExporting(true);

    try {
      const workspaceExport = await getWorkspaceExport();

      downloadJsonFile(
        `rungset-workspace-${new Date().toISOString().slice(0, 10)}.json`,
        workspaceExport,
      );

      setAlert({
        show: true,
        title: 'Export ready',
        message: 'Your workspace data has been downloaded.',
        type: 'success',
      });
    } catch (error) {
      console.error('Error exporting workspace:', error);
      setAlert({
        show: true,
        title: 'Export failed',
        message: 'The workspace export could not be completed.',
        type: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImportWorkspace(file: File) {
    setIsImporting(true);

    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setAlert({
          show: true,
          title: 'Import failed',
          message: 'The selected file is not valid JSON.',
          type: 'error',
        });
        return;
      }

      const summary = await importWorkspaceData(parsed);
      await loadWorkspaceCounts();

      window.dispatchEvent(new CustomEvent(WORKSPACE_SYNC_EVENT));

      const parts = [
        summary.goals > 0 ? `${summary.goals} goals` : null,
        summary.milestones > 0 ? `${summary.milestones} milestones` : null,
        summary.tasks > 0 ? `${summary.tasks} tasks` : null,
        summary.notes > 0 ? `${summary.notes} notes` : null,
        summary.checkIns > 0 ? `${summary.checkIns} check-ins` : null,
        summary.taskOccurrences > 0 ? `${summary.taskOccurrences} history records` : null,
      ].filter(Boolean);

      const countDetails = parts.length > 0 ? parts.join(', ') : '0 items';
      const totalImported = summary.goals + summary.milestones + summary.tasks + summary.notes + summary.checkIns + summary.taskOccurrences;

      if (summary.failures > 0 && totalImported === 0) {
        setAlert({
          show: true,
          title: 'Import failed',
          message: 'None of the items could be imported. Please verify the file data.',
          type: 'error',
        });
      } else if (summary.failures > 0) {
        setAlert({
          show: true,
          title: 'Import completed with warnings',
          message: `Imported ${countDetails}, but ${summary.failures} item(s) could not be imported.`,
          type: 'warning',
        });
      } else {
        setAlert({
          show: true,
          title: 'Data imported',
          message: `Successfully imported ${countDetails} into your workspace.`,
          type: 'success',
        });
      }
    } catch (error) {
      console.error('Error importing workspace:', error);
      setAlert({
        show: true,
        title: 'Import failed',
        message: 'The workspace data could not be imported.',
        type: 'error',
      });
    } finally {
      setIsImporting(false);
    }
  }

  async function handleEnableNotifications() {
    const permission = await requestPermission();
    setNotificationPermission(permission);
  }

  async function handleCacheWorkspace() {
    setIsCaching(true);

    try {
      await cacheAppPages();
      writePwaCacheReady(true);
      setPwaCacheReady(true);
      setAlert({
        show: true,
        title: 'Offline cache ready',
        message: 'The app pages were cached for offline use.',
        type: 'success',
      });
    } catch (error) {
      console.error('Error caching app pages:', error);
      setAlert({
        show: true,
        title: 'Caching failed',
        message: 'The app could not finish preparing offline pages.',
        type: 'error',
      });
    } finally {
      setIsCaching(false);
    }
  }

  async function handleClearLocalCache() {
    if (!session?.user?.id) {
      return;
    }

    setIsClearingCache(true);

    try {
      clearUserCache(session.user.id);
      writePwaCacheReady(false);

      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
      }

      setPwaCacheReady(false);
      await loadWorkspaceCounts();
      setAlert({
        show: true,
        title: 'Local cache cleared',
        message: 'Cached app data was removed. The next refresh will fetch fresh data.',
        type: 'success',
      });
    } catch (error) {
      console.error('Error clearing local cache:', error);
      setAlert({
        show: true,
        title: 'Clear cache failed',
        message: 'The local cache could not be cleared.',
        type: 'error',
      });
    } finally {
      setIsClearingCache(false);
    }
  }

  async function resetWorkspaceData() {
    setIsResettingData(true);

    try {
      const [goals, milestones, notes, todos, checkIns] = await Promise.all([
        getGoals(),
        getMilestones(),
        getNotes(),
        getTodos(),
        getCheckIns(),
      ]);

      for (const milestone of milestones) {
        await deleteMilestone(milestone.id);
      }

      for (const note of notes) {
        await deleteNote(note.id);
      }

      for (const todo of todos) {
        await deleteTodo(todo.id);
      }

      for (const checkIn of checkIns) {
        await deleteCheckIn(checkIn.id);
      }

      for (const goal of goals) {
        await deleteGoal(goal.id);
      }

      await loadWorkspaceCounts();
      setAlert({
        show: true,
        title: 'Workspace reset',
        message: 'All goals, milestones, notes, tasks, and check-ins were deleted.',
        type: 'success',
      });
    } catch (error) {
      console.error('Error resetting workspace:', error);
      setAlert({
        show: true,
        title: 'Reset failed',
        message: 'The workspace data could not be fully deleted.',
        type: 'error',
      });
    } finally {
      setIsResettingData(false);
    }
  }

  async function handleSignOut() {
    try {
      sessionStorage.setItem('goalgenius-logged-out', 'true');
      if (session?.user?.id) {
        clearUserCache(session.user.id);
      }
      await clearOfflineCaches();
      const response = await signOut();
      await clearOfflineCaches();
      if (response) {
        window.location.replace('/');
      }
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  const notificationStatusLabel =
    notificationPermission === 'unsupported'
      ? 'Unsupported'
      : notificationPermission === 'granted'
        ? 'Enabled'
        : notificationPermission === 'denied'
          ? 'Blocked'
          : 'Not enabled';

  function requestClearLocalCache() {
    setAlert({
      show: true,
      title: 'Clear local app cache?',
      message: 'This will remove offline and cached workspace records from this browser. Your server data is safe.',
      type: 'warning',
      isConfirmation: true,
      onConfirm: () => {
        void handleClearLocalCache();
      },
    });
  }

  function requestWorkspaceReset() {
    setAlert({
      show: true,
      title: 'Delete all workspace data?',
      message: 'This will permanently remove all goals, milestones, notes, tasks, and check-ins for your account.',
      type: 'warning',
      isConfirmation: true,
      onConfirm: () => {
        void resetWorkspaceData();
      },
    });
  }

  function closeAlert() {
    setAlert((current) => ({ ...current, show: false }));
  }

  return {
    alert,
    closeAlert,
    counts,
    handleCacheWorkspace,
    handleEnableNotifications,
    handleExportWorkspace,
    handleImportWorkspace,
    handleSignOut,
    handleSidebarCollapsedChange,
    isCaching,
    isClearingCache,
    isExporting,
    isImporting,
    isOnline,
    isResettingData,
    notificationPermission,
    notificationStatusLabel,
    onRequestClearLocalCache: requestClearLocalCache,
    onRequestWorkspaceReset: requestWorkspaceReset,
    pwaCacheReady,
    sessionUser: session?.user,
    settings,
    sidebarCollapsed,
    totalItems,
    updateSettings,
  };
}
