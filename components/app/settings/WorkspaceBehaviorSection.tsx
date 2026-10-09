import { LayoutPanelLeft } from 'lucide-react';
import type { Todo } from '@/app/types';
import type { AppSettings } from '@/lib/app-settings';
import { AppPanel } from '@/components/app/shared/AppPage';

interface ToggleRowProps {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ checked, description, label, onChange }: ToggleRowProps) {
  return (
    <div className="app-setting-row">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
          {description}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        data-checked={checked}
        className="app-switch mt-0.5 focus-visible:outline-none"
      >
        <span className="app-switch-thumb" />
      </button>
    </div>
  );
}

export function WorkspaceBehaviorSection({
  settings,
  sidebarCollapsed,
  onSidebarCollapsedChange,
  onSettingsChange,
}: {
  settings: AppSettings;
  sidebarCollapsed: boolean;
  onSidebarCollapsedChange: (checked: boolean) => void;
  onSettingsChange: (nextPartial: Partial<AppSettings>) => void;
}) {
  return (
    <AppPanel className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="icon-chip h-12 w-12 rounded-[18px]">
          <LayoutPanelLeft className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Workspace behavior</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Preferences that immediately change how the app behaves.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <ToggleRow
          checked={sidebarCollapsed}
          label="Keep the sidebar collapsed by default"
          description="Useful if you prefer a tighter desktop layout when the app loads."
          onChange={onSidebarCollapsedChange}
        />

        <ToggleRow
          checked={settings.showCompletedTodosByDefault}
          label="Show completed tasks by default"
          description="Applies to the tasks page without needing to toggle the filter each time."
          onChange={(checked) =>
            onSettingsChange({ showCompletedTodosByDefault: checked })
          }
        />

        <ToggleRow
          checked={settings.enableInAppNotifications}
          label="Enable in-app toast notifications"
          description="Controls the notification toasts that appear inside Rungset."
          onChange={(checked) =>
            onSettingsChange({ enableInAppNotifications: checked })
          }
        />

        <div className="rounded-[20px] border border-white/10 bg-[rgba(8,17,30,0.42)] px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                Default priority for new tasks
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                Preselect the priority that should appear when you create a new task.
              </p>
            </div>

            <div className="w-full shrink-0 sm:w-40">
              <select
                value={settings.defaultTodoPriority}
                onChange={(event) =>
                  onSettingsChange({
                    defaultTodoPriority: event.target.value as Todo['priority'],
                  })
                }
                className="app-select"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </AppPanel>
  );
}
