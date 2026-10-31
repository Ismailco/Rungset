'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Goal, GoalCategory, Milestone, Todo, TodoOccurrence } from '@/app/types';
import CreateGoalModal from '@/components/app/dashboard/CreateGoalModal';
import GoalSuggestions from '@/components/app/dashboard/GoalSuggestions';
import GoalsEmptyState from '@/components/app/goals/GoalsEmptyState';
import GoalsList from '@/components/app/goals/GoalsList';
import GoalsToolbar from '@/components/app/goals/GoalsToolbar';
import AlertModal from '@/components/common/AlertModal';
import { AppPage } from '@/components/app/shared/AppPage';
import { getGoalProgress, getNextMilestone, sortGoalsForOverview } from '@/lib/domain/goals';
import { todayDateOnly } from '@/lib/domain/date-only';
import { getUserFriendlyErrorMessage } from '@/lib/error';
import { deleteGoal, getGoals, getMilestones, getTodoOccurrences, getTodos } from '@/lib/storage';
import { WORKSPACE_SYNC_EVENT } from '@/lib/workspace-sync-events';
import type { GoalOverviewModel } from '@/components/app/goals/GoalRow';

interface GoalAlert {
  show: boolean;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isConfirmation?: boolean;
  onConfirm?: () => void | Promise<void>;
}

const initialAlert: GoalAlert = {
  show: false,
  title: '',
  message: '',
  type: 'info',
};

function GoalsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading goals">
      <div className="h-8 w-24 animate-pulse rounded-[var(--radius-control)] bg-[var(--bg-surface-subtle)]" />
      <div className="h-12 animate-pulse rounded-[var(--radius-control)] bg-[var(--bg-surface-subtle)]" />
      <div className="overflow-hidden rounded-[var(--radius-container)] border border-[var(--border-subtle)]">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="grid gap-4 border-b border-[var(--border-subtle)] p-5 last:border-b-0 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2"><div className="h-4 w-2/3 animate-pulse rounded bg-[var(--bg-surface-subtle)]" /><div className="h-3 w-full animate-pulse rounded bg-[var(--bg-surface-subtle)]" /></div>
            <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--bg-surface-subtle)]" />
            <div className="h-4 w-16 animate-pulse rounded bg-[var(--bg-surface-subtle)]" />
            <div className="h-2 w-full animate-pulse rounded bg-[var(--bg-surface-subtle)]" />
            <div className="h-9 w-20 animate-pulse rounded bg-[var(--bg-surface-subtle)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [occurrences, setOccurrences] = useState<TodoOccurrence[]>([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<GoalCategory | 'all'>('all');
  const [alert, setAlert] = useState<GoalAlert>(initialAlert);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const loadData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);

    try {
      const [loadedGoals, loadedMilestones, loadedTodos, loadedOccurrences] = await Promise.all([
        getGoals(),
        getMilestones(),
        getTodos(),
        getTodoOccurrences(),
      ]);
      setGoals(loadedGoals);
      setMilestones(loadedMilestones);
      setTodos(loadedTodos);
      setOccurrences(loadedOccurrences);
      setToday(todayDateOnly());
      setError(null);
    } catch (loadError) {
      setError(getUserFriendlyErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(true);

    const handleWorkspaceSync = () => {
      void loadData();
    };
    window.addEventListener(WORKSPACE_SYNC_EVENT, handleWorkspaceSync);
    return () => window.removeEventListener(WORKSPACE_SYNC_EVENT, handleWorkspaceSync);
  }, [loadData]);

  const filteredGoals = useMemo(() => {
    const normalizedSearch = debouncedSearchTerm.toLowerCase();
    return sortGoalsForOverview(goals).filter((goal) => {
      const matchesSearch = !normalizedSearch
        || goal.title.toLowerCase().includes(normalizedSearch)
        || goal.description.toLowerCase().includes(normalizedSearch);
      const matchesCategory = selectedCategory === 'all' || goal.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [debouncedSearchTerm, goals, selectedCategory]);

  const goalModels = useMemo<GoalOverviewModel[]>(() => filteredGoals.map((goal) => ({
    goal,
    hasMilestones: milestones.some((milestone) => milestone.goalId === goal.id),
    nextMilestone: getNextMilestone(goal.id, milestones),
    progress: getGoalProgress(goal, milestones, todos, { today: today || todayDateOnly(), occurrences }),
  })), [filteredGoals, milestones, todos, today, occurrences]);

  const clearFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setSelectedCategory('all');
  };

  const handleDelete = (goal: Goal) => {
    setAlert({
      show: true,
      title: `Delete ${goal.title}?`,
      message: 'This also deletes the goal\'s milestones, linked tasks, and check-ins. Continue?',
      type: 'warning',
      isConfirmation: true,
      onConfirm: async () => {
        try {
          await deleteGoal(goal.id);
          await loadData();
        } catch (deleteError) {
          setAlert({
            show: true,
            title: 'Goal could not be deleted',
            message: getUserFriendlyErrorMessage(deleteError),
            type: 'error',
          });
        }
      },
    });
  };

  const goalIdeasAction = <GoalSuggestions onCreated={() => loadData()} label="Goal ideas" />;

  if (loading) {
    return <AppPage><GoalsLoading /></AppPage>;
  }

  return (
    <AppPage>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Goals</h1>
          <p className="page-description">Keep active outcomes and next milestones in view.</p>
        </div>
        {goals.length > 0 ? <CreateGoalModal onCreated={() => loadData()} label="New goal" /> : null}
      </header>

      <GoalsToolbar
        searchTerm={searchTerm}
        selectedCategory={selectedCategory}
        onSearchChange={setSearchTerm}
        onCategoryChange={setSelectedCategory}
        goalIdeasAction={goals.length > 0 ? goalIdeasAction : null}
      />

      {refreshing ? <span className="sr-only" role="status">Updating goals…</span> : null}

      {error ? (
        <div className="app-empty-state flex flex-col gap-3 px-5 py-6" role="alert">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Goals could not load</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{error}</p>
          </div>
          <button type="button" className="app-button-secondary w-fit" onClick={() => void loadData()}>Retry</button>
        </div>
      ) : goalModels.length > 0 ? (
        <GoalsList goals={goalModels} today={today} onDelete={handleDelete} onUpdated={() => loadData()} />
      ) : (
        <GoalsEmptyState
          hasGoals={goals.length > 0}
          onClearFilters={clearFilters}
          createGoalAction={<CreateGoalModal onCreated={() => loadData()} label="New goal" />}
          goalIdeasAction={<GoalSuggestions onCreated={() => loadData()} label="Goal ideas" />}
        />
      )}

      {alert.show ? (
        <AlertModal
          title={alert.title}
          message={alert.message}
          type={alert.type}
          onClose={() => setAlert(initialAlert)}
          isConfirmation={alert.isConfirmation}
          onConfirm={alert.onConfirm}
          confirmLabel="Delete goal"
          aria-label={`${alert.type} alert: ${alert.title}`}
          role="alertdialog"
        />
      ) : null}
    </AppPage>
  );
}
