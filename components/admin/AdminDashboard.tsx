'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppPage, AppPageHeader, AppPanel } from '@/components/app/shared/AppPage';

type AdminTab = 'overview' | 'users' | 'email' | 'logs';

interface Overview {
  users: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  newUsers30d: number;
  activeUsers30d: number;
  goals: number;
  activeGoals: number;
  completedGoals: number;
  notStartedGoals: number;
  openTasks: number;
  completedTasks: number;
  checkIns: number;
  checkIns30d: number;
  subscribers: number;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  marketingEmailOptIn: boolean;
  marketingEmailPending: boolean;
  marketingEmailUnsubscribedAt: string | null;
  goals: number;
  tasks: number;
  checkIns: number;
  protectedAccount: boolean;
}

interface RuntimeLog {
  id: string;
  timestamp: number | null;
  level: string | null;
  message: string;
  service: string;
  statusCode: number | null;
  trigger: string | null;
  rayId: string | null;
  requestId: string | null;
  dataset: string | null;
  event: Record<string, unknown>;
}

const tabs: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'email', label: 'Email' },
  { id: 'logs', label: 'Logs' },
];

export default function AdminDashboard({ adminName }: { adminName: string }) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);
  const [verificationAction, setVerificationAction] = useState<{ userId: string; message: string; error: boolean } | null>(null);
  const usersRequestId = useRef(0);

  const loadOverview = useCallback(async () => {
    setOverviewError(null);
    try {
      const response = await fetch('/api/admin/overview', { cache: 'no-store' });
      const result = await response.json() as Overview & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not load dashboard stats.');
      setOverview(result);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : 'Could not load dashboard stats.');
    }
  }, []);

  const loadUsers = useCallback(async () => {
    const requestId = ++usersRequestId.current;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const params = new URLSearchParams({ page: String(userPage) });
      if (appliedSearch) params.set('search', appliedSearch);
      const response = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' });
      const result = await response.json() as { users?: AdminUser[]; total?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not load users.');
      if (requestId === usersRequestId.current) {
        setUsers(result.users ?? []);
        setUserTotal(result.total ?? 0);
      }
    } catch (error) {
      if (requestId === usersRequestId.current) {
        setUsersError(error instanceof Error ? error.message : 'Could not load users.');
      }
    } finally {
      if (requestId === usersRequestId.current) setUsersLoading(false);
    }
  }, [appliedSearch, userPage]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (activeTab === 'users') void loadUsers();
  }, [activeTab, loadUsers]);

  const deleteAdminUser = useCallback(async (userId: string, confirmationEmail: string) => {
    const response = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, confirmationEmail }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'Could not delete this user.');

    setUsers((current) => current.filter((account) => account.id !== userId));
    setUserTotal((current) => Math.max(0, current - 1));
    if (users.length === 1 && userPage > 1) {
      setUserPage((current) => current - 1);
    } else {
      await loadUsers();
    }
    await loadOverview();
  }, [loadOverview, loadUsers, userPage, users.length]);

  async function submitBroadcast(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !overview?.subscribers) return;
    const confirmed = window.confirm(`Send this email to ${overview.subscribers} confirmed Rungset subscribers?`);
    if (!confirmed) return;

    setSending(true);
    setSendStatus(null);
    setSendError(null);
    try {
      const response = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });
      const result = await response.json() as { recipientCount?: number; sent?: number; failed?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not send the email.');
      setSendStatus(`Sent to ${result.sent} of ${result.recipientCount} subscribers${result.failed ? `; ${result.failed} failed` : ''}.`);
      if (!result.failed) {
        setSubject('');
        setMessage('');
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Could not send the email.');
    } finally {
      setSending(false);
    }
  }

  async function resendUserVerification(userId: string) {
    if (resendingUserId) return;

    setResendingUserId(userId);
    setVerificationAction(null);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not send the verification email.');
      setVerificationAction({ userId, message: 'Verification email queued.', error: false });
    } catch (error) {
      setVerificationAction({
        userId,
        message: error instanceof Error ? error.message : 'Could not send the verification email.',
        error: true,
      });
    } finally {
      setResendingUserId(null);
    }
  }

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Administration"
        title="Rungset admin"
        description={`Private app operations for ${adminName}.`}
        meta={<span className="app-pill app-pill-blue">Server-authorized</span>}
      />

      <nav className="flex flex-wrap gap-2 border-b border-[var(--border-subtle)] pb-4" aria-label="Admin sections" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`admin-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`admin-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? 'app-button' : 'app-button-secondary'}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section id={`admin-panel-${activeTab}`} role="tabpanel" aria-labelledby={`admin-tab-${activeTab}`} className="space-y-6">
        {activeTab === 'overview' ? (
          <OverviewPanel overview={overview} error={overviewError} onRefresh={() => void loadOverview()} />
        ) : null}
        {activeTab === 'users' ? (
          <UsersPanel
            users={users}
            total={userTotal}
            page={userPage}
            pageSize={25}
            search={userSearch}
            loading={usersLoading}
            error={usersError}
            onSearchChange={setUserSearch}
            onSearch={() => { setUserPage(1); setAppliedSearch(userSearch.trim()); }}
            onPageChange={setUserPage}
            onRefresh={() => void loadUsers()}
            onResendVerification={(userId) => void resendUserVerification(userId)}
            onDeleteUser={deleteAdminUser}
            resendingUserId={resendingUserId}
            verificationAction={verificationAction}
          />
        ) : null}
        {activeTab === 'email' ? (
          <EmailPanel
            subscriberCount={overview?.subscribers ?? 0}
            subject={subject}
            message={message}
            sending={sending}
            status={sendStatus}
            error={sendError}
            onSubjectChange={setSubject}
            onMessageChange={setMessage}
            onSubmit={submitBroadcast}
          />
        ) : null}
        {activeTab === 'logs' ? (
          <LogsPanel />
        ) : null}
      </section>
    </AppPage>
  );
}

function OverviewPanel({ overview, error, onRefresh }: { overview: Overview | null; error: string | null; onRefresh: () => void }) {
  const stats = [
    { label: 'Registered users', value: overview?.users },
    { label: 'Verified users', value: overview?.verifiedUsers },
    { label: 'Needs email verification', value: overview?.unverifiedUsers },
    { label: 'New users · 30 days', value: overview?.newUsers30d },
    { label: 'Signed in · 30 days', value: overview?.activeUsers30d },
    { label: 'Total goals', value: overview?.goals },
    { label: 'Goals · not started', value: overview?.notStartedGoals },
    { label: 'Goals · in progress', value: overview?.activeGoals },
    { label: 'Goals · completed', value: overview?.completedGoals },
    { label: 'Tasks · open', value: overview?.openTasks },
    { label: 'Tasks · completed', value: overview?.completedTasks },
    { label: 'Check-ins', value: overview?.checkIns },
    { label: 'Check-ins · 30 days', value: overview?.checkIns30d },
    { label: 'Confirmed email subscribers', value: overview?.subscribers },
  ];

  return (
    <div className="space-y-6">
      <SectionHeading title="At a glance" action={<button className="app-button-secondary app-button-sm" type="button" onClick={onRefresh}>Refresh</button>} />
      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <AppPanel key={stat.label} className="p-5">
            <p className="text-sm text-[var(--text-secondary)]">{stat.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{stat.value?.toLocaleString() ?? '—'}</p>
          </AppPanel>
        ))}
      </div>
      <AppPanel className="p-5 text-sm leading-6 text-[var(--text-secondary)]">
        Activity totals come from the app database. Runtime logs are available in the Logs section; no third-party product analytics are added.
      </AppPanel>
    </div>
  );
}

function UsersPanel({
  users,
  total,
  page,
  pageSize,
  search,
  loading,
  error,
  onSearchChange,
  onSearch,
  onPageChange,
  onRefresh,
  onResendVerification,
  onDeleteUser,
  resendingUserId,
  verificationAction,
}: {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  loading: boolean;
  error: string | null;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onResendVerification: (userId: string) => void;
  onDeleteUser: (userId: string, confirmationEmail: string) => Promise<void>;
  resendingUserId: string | null;
  verificationAction: { userId: string; message: string; error: boolean } | null;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingDelete || deleteLoading) return;

    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await onDeleteUser(pendingDelete.id, confirmationEmail);
      setPendingDelete(null);
      setConfirmationEmail('');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this user.');
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <AppPanel className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Users</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Account status, recent sign-in, and each user’s goals, tasks, and check-ins.</p>
        </div>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
          <label className="sr-only" htmlFor="admin-user-search">Search users</label>
          <input id="admin-user-search" className="app-field min-w-0 sm:w-64" type="search" maxLength={80} placeholder="Name or email" value={search} onChange={(event) => onSearchChange(event.target.value)} />
          <button className="app-button-secondary" type="submit">Search</button>
        </form>
      </div>
      <div className="mt-5 flex items-center justify-between text-sm text-[var(--text-secondary)]">
        <span>{total.toLocaleString()} users</span>
        <button type="button" className="app-button-ghost app-button-sm" onClick={onRefresh}>Refresh</button>
      </div>
      {error ? <ErrorNotice className="mt-4">{error}</ErrorNotice> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-default)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-3 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Email</th>
              <th className="px-3 py-3 font-medium">Verification</th>
              <th className="px-3 py-3 font-medium">Joined</th>
              <th className="px-3 py-3 font-medium">Last login</th>
              <th className="px-3 py-3 font-medium">App data</th>
              <th className="px-3 py-3 font-medium">Email updates</th>
              <th className="px-3 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="px-3 py-8 text-[var(--text-secondary)]" colSpan={8}>Loading users…</td></tr> : null}
            {!loading && users.length === 0 ? <tr><td className="px-3 py-8 text-[var(--text-secondary)]" colSpan={8}>No users found.</td></tr> : null}
            {!loading ? users.map((account) => (
              <tr key={account.id} className="border-b border-[var(--border-subtle)] last:border-0">
                <td className="px-3 py-3 font-medium text-white">{account.name}</td>
                <td className="px-3 py-3 text-[var(--text-secondary)]">
                  <span>{account.email}</span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-2">
                    <span className={`app-pill ${account.emailVerified ? 'app-pill-success' : 'app-pill-warning'}`}>
                      {account.emailVerified ? 'Verified' : 'Unverified'}
                    </span>
                    {!account.emailVerified ? (
                      <button
                        type="button"
                        className="app-button-secondary app-button-sm"
                        disabled={Boolean(resendingUserId)}
                        onClick={() => onResendVerification(account.id)}
                      >
                        {resendingUserId === account.id ? 'Sending…' : 'Send verification email'}
                      </button>
                    ) : null}
                    {verificationAction?.userId === account.id ? (
                      <span role={verificationAction.error ? 'alert' : 'status'} className={`text-xs ${verificationAction.error ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                        {verificationAction.message}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-3 text-[var(--text-secondary)]">{formatDate(account.createdAt)}</td>
                <td className="px-3 py-3 text-[var(--text-secondary)]">{formatDate(account.lastLoginAt)}</td>
                <td className="px-3 py-3 text-[var(--text-secondary)]">
                  {account.goals} goals · {account.tasks} tasks · {account.checkIns} check-ins
                </td>
                <td className="px-3 py-3 text-[var(--text-secondary)]">{emailStatus(account)}</td>
                <td className="px-3 py-3">
                  {account.protectedAccount ? (
                    <span className="text-xs text-[var(--text-muted)]">Protected admin</span>
                  ) : (
                    <button
                      type="button"
                      className="app-button-secondary app-button-sm"
                      onClick={() => {
                        setPendingDelete(account);
                        setConfirmationEmail('');
                        setDeleteError(null);
                      }}
                    >
                      Delete user
                    </button>
                  )}
                </td>
              </tr>
            )) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <button className="app-button-secondary app-button-sm" type="button" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>Previous</button>
        <span className="text-sm text-[var(--text-secondary)]">Page {page} of {totalPages}</span>
        <button className="app-button-secondary app-button-sm" type="button" disabled={page >= totalPages || loading} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
          <section
            className="w-full max-w-lg rounded-[var(--radius-panel)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
          >
            <h3 id="delete-user-title" className="text-lg font-semibold text-white">Delete {pendingDelete.name}?</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              This permanently removes {pendingDelete.email}, their authentication records, subscription, goals, milestones, tasks, check-ins, and notes. This cannot be undone.
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              This removes Rungset’s server-side records, not copies already downloaded to the user’s browser. Cloudflare runtime logs are separate and follow Cloudflare’s retention period.
            </p>
            {deleteError ? <ErrorNotice className="mt-4">{deleteError}</ErrorNotice> : null}
            <form className="mt-5 space-y-4" onSubmit={(event) => void confirmDelete(event)}>
              <label className="block text-sm text-[var(--text-secondary)]" htmlFor="delete-user-confirmation">
                Type the user’s email to confirm
              </label>
              <input
                id="delete-user-confirmation"
                className="app-field"
                type="email"
                autoComplete="off"
                required
                value={confirmationEmail}
                onChange={(event) => setConfirmationEmail(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="app-button-secondary"
                  disabled={deleteLoading}
                  onClick={() => { setPendingDelete(null); setConfirmationEmail(''); setDeleteError(null); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="app-button-danger"
                  disabled={deleteLoading || confirmationEmail.trim().toLowerCase() !== pendingDelete.email.toLowerCase()}
                >
                  {deleteLoading ? 'Deleting…' : 'Permanently delete'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AppPanel>
  );
}

function EmailPanel({
  subscriberCount,
  subject,
  message,
  sending,
  status,
  error,
  onSubjectChange,
  onMessageChange,
  onSubmit,
}: {
  subscriberCount: number;
  subject: string;
  message: string;
  sending: boolean;
  status: string | null;
  error: string | null;
  onSubjectChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <AppPanel className="max-w-3xl p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-white">Send an update</h2>
      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
        Sends individually from hello@rungset.com to confirmed subscribers. Existing accounts are not subscribed by default; each email includes a one-click unsubscribe link. Campaigns are limited to 1,000 recipients until queued sending is added.
      </p>
      <p className="mt-4 app-pill app-pill-blue">{subscriberCount.toLocaleString()} confirmed subscriber{subscriberCount === 1 ? '' : 's'}</p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]" htmlFor="admin-email-subject">Subject</label>
          <input id="admin-email-subject" className="app-field" value={subject} maxLength={120} required onChange={(event) => onSubjectChange(event.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]" htmlFor="admin-email-message">Message</label>
          <textarea id="admin-email-message" className="app-field min-h-48 resize-y" value={message} maxLength={10_000} required onChange={(event) => onMessageChange(event.target.value)} />
          <p className="mt-1 text-right text-xs text-[var(--text-muted)]">{message.length.toLocaleString()} / 10,000</p>
        </div>
        {status ? <p className="text-sm text-[var(--success)]" role="status">{status}</p> : null}
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        <button className="app-button" type="submit" disabled={sending || subscriberCount === 0}>
          {sending ? 'Sending…' : `Send to ${subscriberCount.toLocaleString()} subscribers`}
        </button>
      </form>
    </AppPanel>
  );
}

function LogsPanel() {
  const [logs, setLogs] = useState<RuntimeLog[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [rangeDraft, setRangeDraft] = useState<'1h' | '24h' | '7d'>('7d');
  const [levelDraft, setLevelDraft] = useState('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [filters, setFilters] = useState({ range: '7d', level: 'all', search: '' });
  const requestId = useRef(0);
  const timeframeEndRef = useRef<number | null>(null);

  const loadLogs = useCallback(async (cursor: string | null, append: boolean) => {
    const currentRequestId = ++requestId.current;
    setError(null);
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams({ range: filters.range, level: filters.level });
      if (filters.search) params.set('search', filters.search);
      if (cursor) {
        if (timeframeEndRef.current === null) throw new Error('Refresh logs before loading another page.');
        params.set('cursor', cursor);
        params.set('timeframeEnd', String(timeframeEndRef.current));
      }
      const response = await fetch(`/api/admin/logs?${params}`, { cache: 'no-store' });
      const result = await response.json() as {
        configured?: boolean;
        count?: number;
        logs?: RuntimeLog[];
        timeframeEnd?: number;
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Could not load Cloudflare logs.');
      if (currentRequestId !== requestId.current) return;

      if (result.nextCursor && !Number.isSafeInteger(result.timeframeEnd)) {
        throw new Error('Could not continue loading Cloudflare logs. Refresh and try again.');
      }
      timeframeEndRef.current = result.timeframeEnd ?? null;
      setConfigured(result.configured ?? false);
      setTotal(result.count ?? 0);
      setNextCursor(result.nextCursor ?? null);
      const incoming = result.logs ?? [];
      setLogs((current) => {
        if (!append) return incoming;
        const currentIds = new Set(current.map((entry) => entry.id));
        return [...current, ...incoming.filter((entry) => !currentIds.has(entry.id))];
      });
    } catch (loadError) {
      if (currentRequestId === requestId.current) {
        if (!append) {
          timeframeEndRef.current = null;
          setLogs([]);
          setTotal(0);
          setNextCursor(null);
        }
        setError(loadError instanceof Error ? loadError.message : 'Could not load Cloudflare logs.');
      }
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    void loadLogs(null, false);
  }, [loadLogs]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ range: rangeDraft, level: levelDraft, search: searchDraft.trim() });
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Cloudflare Worker logs"
        action={<button className="app-button-secondary app-button-sm" type="button" onClick={() => void loadLogs(null, false)} disabled={loading || loadingMore}>Refresh</button>}
      />
      <AppPanel className="p-5">
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          Browse and filter Rungset Worker events. Cloudflare retains Worker logs for up to 7 days; older events are not available here.
        </p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_12rem_12rem_auto]" onSubmit={applyFilters}>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]" htmlFor="admin-log-search">Search all event fields</label>
            <input id="admin-log-search" className="app-field" type="search" maxLength={100} placeholder="Message, route, request ID…" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]" htmlFor="admin-log-range">Time range</label>
            <select id="admin-log-range" className="app-field" value={rangeDraft} onChange={(event) => setRangeDraft(event.target.value as '1h' | '24h' | '7d')}>
              <option value="1h">Past hour</option>
              <option value="24h">Past 24 hours</option>
              <option value="7d">Past 7 days</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]" htmlFor="admin-log-level">Severity</label>
            <select id="admin-log-level" className="app-field" value={levelDraft} onChange={(event) => setLevelDraft(event.target.value)}>
              <option value="all">All levels</option>
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info">Info</option>
              <option value="log">Log</option>
              <option value="debug">Debug</option>
            </select>
          </div>
          <button className="app-button self-end" type="submit" disabled={loading || loadingMore}>Apply filters</button>
        </form>
      </AppPanel>
      {configured === false ? (
        <AppPanel className="p-5 text-sm leading-6 text-[var(--text-secondary)]">
          Log access is not configured. Set the server secret <code>RUNGSET_OBSERVABILITY_API_TOKEN</code> to enable the log view. Cloudflare requires a Workers Observability Write token for its query endpoint; the credential stays on the server.
        </AppPanel>
      ) : null}
      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      {loading ? <AppPanel className="p-5 text-sm text-[var(--text-secondary)]">Loading Cloudflare logs…</AppPanel> : null}
      {!loading && configured && logs.length === 0 ? <AppPanel className="p-5 text-sm text-[var(--text-secondary)]">No runtime events match these filters.</AppPanel> : null}
      {logs.length > 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Showing {logs.length.toLocaleString()} events; Cloudflare reports {total.toLocaleString()} matching events for this filter.
        </p>
      ) : null}
      {logs.map((entry) => (
        <AppPanel key={entry.id} className="overflow-hidden p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            <time dateTime={entry.timestamp ? new Date(entry.timestamp).toISOString() : undefined}>{formatTimestamp(entry.timestamp)}</time>
            {entry.level ? <span className="app-pill app-pill-blue">{entry.level}</span> : null}
            <span>{entry.service}</span>
            {entry.dataset ? <span>{entry.dataset}</span> : null}
            {entry.trigger ? <span>{entry.trigger}</span> : null}
            {entry.statusCode ? <span>Status {entry.statusCode}</span> : null}
            {entry.requestId ? <span className="font-mono">Request {entry.requestId}</span> : null}
            {entry.rayId ? <span className="font-mono">Ray {entry.rayId}</span> : null}
          </div>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[var(--text-primary)]">{entry.message}</pre>
          <details className="mt-3 text-xs text-[var(--text-secondary)]">
            <summary className="cursor-pointer">Full event details</summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-control)] bg-[var(--bg-surface)] p-3 font-mono leading-5">{JSON.stringify(entry.event, null, 2)}</pre>
          </details>
        </AppPanel>
      ))}
      {nextCursor ? (
        <div className="flex justify-center">
          <button className="app-button-secondary" type="button" disabled={loading || loadingMore} onClick={() => void loadLogs(nextCursor, true)}>
            {loadingMore ? 'Loading more…' : 'Load more logs'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold text-white">{title}</h2>{action}</div>;
}

function ErrorNotice({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`rounded-[var(--radius-control)] border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--text-primary)] ${className}`} role="alert">{children}</p>;
}

function formatDate(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function formatTimestamp(value: number | null) {
  if (!value) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
}

function emailStatus(account: AdminUser) {
  if (account.marketingEmailOptIn && !account.marketingEmailUnsubscribedAt) return 'Subscribed';
  if (account.marketingEmailPending) return 'Confirmation pending';
  return account.marketingEmailUnsubscribedAt ? 'Unsubscribed' : 'Not subscribed';
}
