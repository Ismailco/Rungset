import { Database, Download, ShieldCheck, Trash2 } from 'lucide-react';
import { AppPanel } from '@/components/app/shared/AppPage';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import type { WorkspaceCounts } from './types';

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-[var(--border-subtle)] py-3 last:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-white">
        {value}
      </p>
    </div>
  );
}

export function WorkspaceDataSection({
  counts,
  totalItems,
  isExporting,
  isClearingCache,
  isResettingData,
  onExportWorkspace,
  onRequestClearLocalCache,
  onRequestWorkspaceReset,
}: {
  counts: WorkspaceCounts;
  totalItems: number;
  isExporting: boolean;
  isClearingCache: boolean;
  isResettingData: boolean;
  onExportWorkspace: () => void;
  onRequestClearLocalCache: () => void;
  onRequestWorkspaceReset: () => void;
}) {
  return (
    <AppPanel className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="icon-chip h-12 w-12 rounded-[18px]">
          <Database className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Workspace data</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Export, clear local caches, or reset all tracked items.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 md:grid-cols-5">
        <MetricCard label="Goals" value={counts.goals} />
        <MetricCard label="Milestones" value={counts.milestones} />
        <MetricCard label="Notes" value={counts.notes} />
        <MetricCard label="Tasks" value={counts.todos} />
        <MetricCard label="Check-ins" value={counts.checkIns} />
      </div>

      <div className="mt-6 border-t border-[var(--border-subtle)] pt-4">
        <p className="text-sm font-semibold text-white">Total tracked items</p>
        <p className="mt-2 text-4xl font-bold tracking-[-0.05em] text-white">
          {totalItems}
        </p>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={onExportWorkspace}
          disabled={isExporting}
          className="app-button disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isExporting ? <LoadingSpinner size="small" /> : <Download className="h-4 w-4" />}
          Export JSON
        </button>

        <button
          type="button"
          onClick={onRequestClearLocalCache}
          disabled={isClearingCache}
          className="app-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isClearingCache ? <LoadingSpinner size="small" /> : <ShieldCheck className="h-4 w-4" />}
          Clear local cache
        </button>

        <button
          type="button"
          onClick={onRequestWorkspaceReset}
          disabled={isResettingData}
          className="app-button-danger md:col-span-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isResettingData ? <LoadingSpinner size="small" /> : <Trash2 className="h-4 w-4" />}
          Reset workspace
        </button>
      </div>
    </AppPanel>
  );
}
