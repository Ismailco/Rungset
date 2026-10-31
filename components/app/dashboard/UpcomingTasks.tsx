import Link from 'next/link';
import { AlertCircle, ArrowRight, CalendarDays, Circle, Flag, LoaderCircle } from 'lucide-react';
import type { Goal, Todo } from '@/app/types';
import type { UpcomingTaskGroup, UpcomingTaskGroupName } from '@/lib/domain/dashboard';
import { formatDateOnly } from '@/lib/domain/date-only';

interface UpcomingTasksProps {
  groups: UpcomingTaskGroup[];
  goalsById: Map<string, Goal>;
  onToggle: (todo: Todo) => void;
  pendingTodoId: string | null;
  today: string;
}

const GROUP_LABELS: Record<UpcomingTaskGroupName, string> = {
  overdue: 'Overdue',
  today: 'Today',
  next: 'Next',
};

function dueLabel(todo: Todo, groupName: UpcomingTaskGroupName, today: string) {
  if (groupName === 'overdue') {
    return {
      label: `Overdue · ${formatDateOnly(todo.dueDate!, { month: 'short', day: 'numeric' })}`,
      className: 'text-[var(--danger)]',
    };
  }
  if (groupName === 'today') return { label: 'Due today', className: 'text-[var(--warning)]' };
  if (!todo.dueDate) return { label: 'No due date', className: 'text-[var(--text-muted)]' };
  return {
    label: `Due ${formatDateOnly(todo.dueDate, { month: 'short', day: 'numeric' })}`,
    className: todo.dueDate > today ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]',
  };
}

export default function UpcomingTasks({ groups, goalsById, onToggle, pendingTodoId, today }: UpcomingTasksProps) {
  return (
    <section aria-labelledby="today-upcoming-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="today-upcoming-heading" className="text-lg font-semibold text-[var(--text-primary)]">Today&apos;s tasks</h2>
        <Link href="/todos" prefetch={false} className="app-button-ghost app-button-sm">
          View all tasks <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="app-empty-state mt-3 p-5">
          <p className="text-sm text-[var(--text-secondary)]">No tasks for today.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {groups.map((group) => (
            <section key={group.name} aria-labelledby={`upcoming-${group.name}-heading`}>
              <h3 id={`upcoming-${group.name}-heading`} className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {group.name === 'overdue' ? <AlertCircle className="h-3.5 w-3.5 text-[var(--danger)]" aria-hidden="true" /> : <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />}
                {GROUP_LABELS[group.name]}
              </h3>
              <div className="overflow-hidden rounded-[var(--radius-container)] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]">
                {group.tasks.map((todo) => {
                  const goal = todo.goalId ? goalsById.get(todo.goalId) : undefined;
                  const due = dueLabel(todo, group.name, today);
                  const isPending = pendingTodoId === todo.id;

                  return (
                    <div key={todo.id} className="flex items-center gap-3 border-b border-[var(--border-subtle)] p-3 last:border-b-0 sm:px-4">
                      <button
                        type="button"
                        className="app-button-ghost app-button-icon h-11 w-11 shrink-0"
                        onClick={() => onToggle(todo)}
                        disabled={isPending}
                        aria-label={`Mark ${todo.title} complete`}
                        aria-busy={isPending}
                      >
                        {isPending ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Circle className="h-5 w-5" aria-hidden="true" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-[var(--text-primary)]">{todo.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {goal ? (
                            <Link href={`/goals/${goal.id}`} prefetch={false} className="truncate text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                              {goal.title}
                            </Link>
                          ) : null}
                          <span className={`inline-flex items-center gap-1 ${due.className}`}>
                            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                            {due.label}
                          </span>
                          {todo.priority === 'high' ? (
                            <span className="inline-flex items-center gap-1 text-[var(--danger)]" title="High priority">
                              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only">High priority</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
