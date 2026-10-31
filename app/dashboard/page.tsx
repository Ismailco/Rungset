'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CheckIn, Goal, Milestone, Todo } from '@/app/types';
import CreateCheckInModal from '@/components/app/checkins/CreateCheckInModal';
import CreateGoalModal from '@/components/app/dashboard/CreateGoalModal';
import DashboardGoals from '@/components/app/dashboard/DashboardGoals';
import GoalSuggestions from '@/components/app/dashboard/GoalSuggestions';
import NextUp from '@/components/app/dashboard/NextUp';
import TodayHeader from '@/components/app/dashboard/TodayHeader';
import UpcomingTasks from '@/components/app/dashboard/UpcomingTasks';
import WeeklyReview from '@/components/app/dashboard/WeeklyReview';
import CreateTodoModal from '@/components/app/todos/CreateTodoModal';
import { AppPage } from '@/components/app/shared/AppPage';
import {
  getDashboardGoals,
  getGoalProgress,
  getGoalsNeedingCheckIn,
  groupUpcomingTasks,
  selectNextTask,
  type DashboardReviewGoal,
} from '@/lib/domain/dashboard';
import { todayDateOnly } from '@/lib/domain/date-only';
import { resolveTodoGoalId } from '@/lib/domain/todos';
import {
  getCheckIns,
  getGoals,
  getMilestones,
  getTodos,
  toggleTodoComplete,
} from '@/lib/storage';
import { WORKSPACE_SYNC_EVENT } from '@/lib/workspace-sync-events';

export default function DashboardPage() {
  const [today, setToday] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [pendingTodoId, setPendingTodoId] = useState<string | null>(null);
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [reviewGoal, setReviewGoal] = useState<DashboardReviewGoal | null>(null);

  const refreshDashboard = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    setToday(todayDateOnly());

    try {
      const [loadedGoals, loadedMilestones, loadedTodos, loadedCheckIns] = await Promise.all([
        getGoals(),
        getMilestones(),
        getTodos(),
        getCheckIns(),
      ]);

      setGoals(loadedGoals);
      setMilestones(loadedMilestones);
      setTodos(loadedTodos);
      setCheckIns(loadedCheckIns);
    } catch {
      setError('Today could not load your workspace. Try again.');
    } finally {
      setHasLoaded(true);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshDashboard();
    const handleWorkspaceSync = () => void refreshDashboard();
    window.addEventListener(WORKSPACE_SYNC_EVENT, handleWorkspaceSync);
    return () => window.removeEventListener(WORKSPACE_SYNC_EVENT, handleWorkspaceSync);
  }, [refreshDashboard]);

  const goalsById = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal])),
    [goals],
  );
  const milestonesById = useMemo(
    () => new Map(milestones.map((milestone) => [milestone.id, milestone])),
    [milestones],
  );
  const nextTask = today ? selectNextTask(todos, today) : null;
  const effectiveGoalId = nextTask
    ? resolveTodoGoalId(nextTask, milestonesById)
    : null;
  const nextTaskGoal = effectiveGoalId
    ? goalsById.get(effectiveGoalId) ?? null
    : null;
  const nextTaskMilestone = nextTask?.milestoneId
    ? milestonesById.get(nextTask.milestoneId) ?? null
    : null;
  const nextTaskProgress = nextTaskGoal
    ? getGoalProgress(nextTaskGoal, milestones, todos, today)
    : null;
  const dashboardGoals = getDashboardGoals(goals, milestones, todos, 3, today);
  const reviewGoals = today ? getGoalsNeedingCheckIn(goals, checkIns, today) : [];
  const upcomingGroups = today ? groupUpcomingTasks(todos, today) : [];
  const activeGoalCount = goals.filter((goal) => goal.status !== 'completed').length;

  async function handleCompleteTodo(todo: Todo) {
    if (pendingTodoId) return;

    setActionError(null);
    setPendingTodoId(todo.id);
    try {
      await toggleTodoComplete(todo.id);
      await refreshDashboard();
    } catch {
      setActionError('Task could not be completed. Try again.');
    } finally {
      setPendingTodoId(null);
    }
  }

  function handleTodoSaved() {
    setIsTodoModalOpen(false);
    void refreshDashboard();
  }

  function handleCheckInSaved() {
    setReviewGoal(null);
    void refreshDashboard();
  }

  if (!hasLoaded) {
    return (
      <AppPage>
        <div className="space-y-5" aria-busy="true" aria-label="Loading Today">
          <div className="animate-pulse">
            <div className="h-8 w-24 rounded-lg bg-[var(--bg-surface-hover)]" />
            <div className="mt-3 h-4 w-44 rounded bg-[var(--bg-surface-subtle)]" />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.85fr)]">
            <div className="surface-panel h-64 animate-pulse bg-[var(--bg-surface-subtle)]" />
            <div className="surface-panel h-64 animate-pulse bg-[var(--bg-surface-subtle)]" />
          </div>
          <div className="h-48 animate-pulse rounded-[var(--radius-container)] bg-[var(--bg-surface-subtle)]" />
          <div className="h-56 animate-pulse rounded-[var(--radius-container)] bg-[var(--bg-surface-subtle)]" />
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage>
      <TodayHeader date={today} />

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[#ffe0e6]" role="alert">
          <span>{error}</span>
          <button type="button" className="app-button-secondary app-button-sm" onClick={() => void refreshDashboard()}>
            Retry
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[#ffe0e6]" role="alert">
          <span>{actionError}</span>
          <button type="button" className="app-button-ghost app-button-sm" onClick={() => setActionError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.85fr)]">
        <NextUp
          goal={nextTaskGoal}
          goalProgress={nextTaskProgress}
          hasTasks={todos.length > 0}
          isCompleting={pendingTodoId === nextTask?.id}
          milestone={nextTaskMilestone}
          onComplete={handleCompleteTodo}
          onCreateTask={() => setIsTodoModalOpen(true)}
          task={nextTask}
          today={today}
        />
        <WeeklyReview
          activeGoalCount={activeGoalCount}
          onCheckIn={setReviewGoal}
          reviews={reviewGoals}
        />
      </div>

      <DashboardGoals
        createGoalAction={<CreateGoalModal />}
        goalIdeasAction={<GoalSuggestions />}
        goals={dashboardGoals}
      />

      <UpcomingTasks
        goalsById={goalsById}
        groups={upcomingGroups}
        onToggle={handleCompleteTodo}
        pendingTodoId={pendingTodoId}
        today={today}
      />

      {isRefreshing ? (
        <p className="text-xs text-[var(--text-muted)]" role="status" aria-live="polite">
          Updating Today…
        </p>
      ) : null}

      {isTodoModalOpen ? (
        <CreateTodoModal
          isOpen={isTodoModalOpen}
          onClose={() => setIsTodoModalOpen(false)}
          onSave={handleTodoSaved}
        />
      ) : null}

      {reviewGoal ? (
        <CreateCheckInModal
          isOpen
          goalId={reviewGoal.goal.id}
          onClose={() => setReviewGoal(null)}
          onSave={handleCheckInSaved}
        />
      ) : null}
    </AppPage>
  );
}
