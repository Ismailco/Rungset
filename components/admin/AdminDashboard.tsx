'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppPage, AppPageHeader, AppPanel } from '@/components/app/shared/AppPage';

type AdminTab = 'overview' | 'users' | 'email' | 'logs';

interface Overview {
  users: number;
  newUsers30d: number;
  activeUsers30d: number;
  goals: number;
  tasks: number;
  checkIns: number;
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
}

interface RuntimeLog {
  id: string;
  timestamp: number | null;
  message: string;
  service: string;
  statusCode: number | null;
  trigger: string | null;
  rayId: string | null;
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
  const [logs, setLogs] = useState<RuntimeLog[]>([]);
  const [logsConfigured, setLogsConfigured] = useState<boolean | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

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
    setUsersLoading(true);
    setUsersError(null);
    try {
      const params = new URLSearchParams({ page: String(userPage) });
      if (appliedSearch) params.set('search', appliedSearch);
      const response = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' });
      const result = await response.json() as { users?: AdminUser[]; total?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not load users.');
      setUsers(result.users ?? []);
      setUserTotal(result.total ?? 0);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : 'Could not load users.');
    } finally {
      setUsersLoading(false);
    }
  }, [appliedSearch, userPage]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const response = await fetch('/api/admin/logs', { cache: 'no-store' });
      const result = await response.json() as { configured?: boolean; logs?: RuntimeLog[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not load Cloudflare logs.');
      setLogsConfigured(result.configured ?? false);
      setLogs(result.logs ?? []);
    } catch (error) {
      setLogsError(error instanceof Error ? error.message : 'Could not load Cloudflare logs.');
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (activeTab === 'users') void loadUsers();
    if (activeTab === 'logs') void loadLogs();
  }, [activeTab, loadLogs, loadUsers]);

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
          <LogsPanel logs={logs} configured={logsConfigured} loading={logsLoading} error={logsError} onRefresh={() => void loadLogs()} />
        ) : null}
      </section>
    </AppPage>
  );
}

function OverviewPanel({ overview, error, onRefresh }: { overview: Overview | null; error: string | null; onRefresh: () => void }) {
  const stats = [
    { label: 'Registered users', value: overview?.users },
    { label: 'New users · 30 days', value: overview?.newUsers30d },
    { label: 'Signed in · 30 days', value: overview?.activeUsers30d },
    { label: 'Goals', value: overview?.goals },
    { label: 'Tasks', value: overview?.tasks },
    { label: 'Check-ins', value: overview?.checkIns },
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
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <AppPanel className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Users</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Names, email addresses, signup and last-login dates.</p>
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
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-default)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-3 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Email</th>
              <th className="px-3 py-3 font-medium">Joined</th>
              <th className="px-3 py-3 font-medium">Last login</th>
              <th className="px-3 py-3 font-medium">Email updates</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="px-3 py-8 text-[var(--text-secondary)]" colSpan={5}>Loading users…</td></tr> : null}
            {!loading && users.length === 0 ? <tr><td className="px-3 py-8 text-[var(--text-secondary)]" colSpan={5}>No users found.</td></tr> : null}
            {!loading ? users.map((account) => (
              <tr key={account.id} className="border-b border-[var(--border-subtle)] last:border-0">
                <td className="px-3 py-3 font-medium text-white">{account.name}</td>
                <td className="px-3 py-3 text-[var(--text-secondary)]">
                  <span>{account.email}</span>
                  {!account.emailVerified ? <span className="ml-2 text-xs text-[var(--warning)]">Unverified</span> : null}
                </td>
                <td className="px-3 py-3 text-[var(--text-secondary)]">{formatDate(account.createdAt)}</td>
                <td className="px-3 py-3 text-[var(--text-secondary)]">{formatDate(account.lastLoginAt)}</td>
                <td className="px-3 py-3 text-[var(--text-secondary)]">{emailStatus(account)}</td>
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

function LogsPanel({ logs, configured, loading, error, onRefresh }: { logs: RuntimeLog[]; configured: boolean | null; loading: boolean; error: string | null; onRefresh: () => void }) {
  return (
    <div className="space-y-4">
      <SectionHeading title="Cloudflare Worker logs · last 24 hours" action={<button className="app-button-secondary app-button-sm" type="button" onClick={onRefresh} disabled={loading}>Refresh</button>} />
      {configured === false ? (
        <AppPanel className="p-5 text-sm leading-6 text-[var(--text-secondary)]">
          Log access is not configured. Set the server secret <code>RUNGSET_OBSERVABILITY_API_TOKEN</code> to enable the log view. Cloudflare currently requires an account-scoped Workers Observability Write token for its query endpoint, even though this app only submits read queries; the credential stays on the server.
        </AppPanel>
      ) : null}
      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      {loading ? <AppPanel className="p-5 text-sm text-[var(--text-secondary)]">Loading Cloudflare logs…</AppPanel> : null}
      {!loading && configured && logs.length === 0 ? <AppPanel className="p-5 text-sm text-[var(--text-secondary)]">No runtime events found for this period.</AppPanel> : null}
      {logs.map((entry) => (
        <AppPanel key={entry.id} className="overflow-hidden p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            <time dateTime={entry.timestamp ? new Date(entry.timestamp).toISOString() : undefined}>{formatTimestamp(entry.timestamp)}</time>
            <span>{entry.service}</span>
            {entry.trigger ? <span>{entry.trigger}</span> : null}
            {entry.statusCode ? <span>Status {entry.statusCode}</span> : null}
            {entry.rayId ? <span className="font-mono">Ray {entry.rayId}</span> : null}
          </div>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[var(--text-primary)]">{entry.message}</pre>
        </AppPanel>
      ))}
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
