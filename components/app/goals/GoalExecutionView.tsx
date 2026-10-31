'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CheckIn, Goal, Milestone, Todo, TodoOccurrence } from '@/app/types';
import { AppPage } from '@/components/app/shared/AppPage';
import CreateCheckInModal from '@/components/app/checkins/CreateCheckInModal';
import GoalCheckIns from '@/components/app/goals/GoalCheckIns';
import GoalDetailSkeleton from '@/components/app/goals/GoalDetailSkeleton';
import GoalHeader from '@/components/app/goals/GoalHeader';
import GoalMilestones from '@/components/app/goals/GoalMilestones';
import GoalTasks from '@/components/app/goals/GoalTasks';
import CreateTodoModal from '@/components/app/todos/CreateTodoModal';
import { todayDateOnly } from '@/lib/domain/date-only';
import { getLatestGoalCheckIn } from '@/lib/domain/checkins';
import { getGoalProgress, getMilestoneTaskCounts, getNextMilestone } from '@/lib/domain/goals';
import { sortTodosByActionability } from '@/lib/domain/todos';
import {
  getCheckIns,
  getGoal,
  getMilestones,
  getTodoOccurrences,
  getTodos,
  toggleTodoComplete,
  updateMilestone,
} from '@/lib/storage';
import { WORKSPACE_SYNC_EVENT } from '@/lib/workspace-sync-events';

export default function GoalExecutionView({ goalId }: { goalId: string }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [occurrences, setOccurrences] = useState<TodoOccurrence[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingTodoId, setPendingTodoId] = useState<string | null>(null);
  const [pendingMilestoneId, setPendingMilestoneId] = useState<string | null>(null);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [nextGoal, nextMilestones, nextTodos, nextCheckIns, nextOccurrences] = await Promise.all([
        getGoal(goalId),
        getMilestones(),
        getTodos(),
        getCheckIns(),
        getTodoOccurrences(),
      ]);
      const goalMilestones = nextMilestones.filter((milestone) => milestone.goalId === goalId);
      const goalMilestoneIds = new Set(goalMilestones.map((milestone) => milestone.id));
      const goalTodos = nextTodos.filter((todo) => todo.goalId === goalId || (todo.milestoneId ? goalMilestoneIds.has(todo.milestoneId) : false));
      const goalCheckIns = nextCheckIns
        .filter((checkIn) => checkIn.goalId === goalId)
        .sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt));

      setGoal(nextGoal);
      setMilestones(goalMilestones);
      setTodos(goalTodos);
      setCheckIns(goalCheckIns);
      setOccurrences(nextOccurrences);
      setToday(todayDateOnly());
    } catch {
      setError('This goal could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [goalId]);

  useEffect(() => {
    void load();
    const handleWorkspaceSync = () => void load();
    window.addEventListener(WORKSPACE_SYNC_EVENT, handleWorkspaceSync);
    return () => window.removeEventListener(WORKSPACE_SYNC_EVENT, handleWorkspaceSync);
  }, [load]);

  const effectiveToday = today || todayDateOnly();
  const goalMilestoneIds = useMemo(() => new Set(milestones.map((milestone) => milestone.id)), [milestones]);
  const goalTodos = useMemo(
    () => todos.filter((todo) => todo.goalId === goalId || (todo.milestoneId ? goalMilestoneIds.has(todo.milestoneId) : false)),
    [goalId, goalMilestoneIds, todos],
  );
  const orderedTodos = useMemo(() => sortTodosByActionability(goalTodos, effectiveToday), [effectiveToday, goalTodos]);
  const orderedMilestones = useMemo(
    () => milestones
      .map((milestone, index) => ({ milestone, index }))
      .sort((left, right) => left.milestone.date.localeCompare(right.milestone.date) || left.index - right.index)
      .map(({ milestone }) => milestone),
    [milestones],
  );
  const milestonesById = useMemo(() => new Map(milestones.map((milestone) => [milestone.id, milestone])), [milestones]);
  const taskCounts = useMemo(() => getMilestoneTaskCounts(orderedMilestones, goalTodos), [goalTodos, orderedMilestones]);
  const nextMilestoneId = useMemo(() => goal ? getNextMilestone(goal.id, orderedMilestones)?.id ?? null : null, [goal, orderedMilestones]);
  const progress = useMemo(
    () => goal ? getGoalProgress(goal, milestones, goalTodos, { today: effectiveToday, occurrences }) : 0,
    [effectiveToday, goal, goalTodos, milestones, occurrences],
  );
  const lastCheckIn = useMemo(() => getLatestGoalCheckIn(goalId, checkIns), [checkIns, goalId]);

  const openTaskModal = (milestoneId: string | null = null) => {
    setSelectedMilestoneId(milestoneId);
    setIsTaskOpen(true);
  };

  async function handleToggleTask(todo: Todo) {
    setPendingTodoId(todo.id);
    try {
      await toggleTodoComplete(todo.id);
      await load();
    } catch {
      setError('The task could not be updated. Please try again.');
    } finally {
      setPendingTodoId(null);
    }
  }

  async function handleToggleMilestone(milestone: Milestone) {
    setPendingMilestoneId(milestone.id);
    try {
      await updateMilestone(milestone.id, { completed: !milestone.completed });
      await load();
    } catch {
      setError('The milestone could not be updated. Please try again.');
    } finally {
      setPendingMilestoneId(null);
    }
  }

  if (loading) return <AppPage><GoalDetailSkeleton /></AppPage>;

  if (error && !goal) {
    return (
      <AppPage>
        <div className="app-empty-state px-5 py-8" role="alert">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Goal could not load</h1>
          <p className="mt-2 text-sm">{error}</p>
          <button type="button" className="app-button mt-5" onClick={() => void load()}>Retry</button>
        </div>
      </AppPage>
    );
  }

  if (!goal) {
    return (
      <AppPage>
        <div className="app-empty-state px-5 py-8">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Goal not found</h1>
          <Link className="app-button mt-5 inline-flex" href="/goals" prefetch={false}>Back to Goals</Link>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage>
      <GoalHeader
        goal={goal}
        lastCheckIn={lastCheckIn}
        onAddTask={() => openTaskModal()}
        onCheckIn={() => setIsCheckInOpen(true)}
        onRefresh={() => void load()}
        onUpdated={() => load()}
        progress={progress}
        refreshing={refreshing}
        today={effectiveToday}
      />

      {error ? <div className="border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--text-primary)]" role="alert">{error}</div> : null}

      <GoalTasks
        milestonesById={milestonesById}
        onAddTask={() => openTaskModal()}
        onToggle={handleToggleTask}
        pendingTodoId={pendingTodoId}
        today={effectiveToday}
        todos={orderedTodos}
      />
      <GoalMilestones
        goal={goal}
        milestones={orderedMilestones}
        onAddTask={(milestoneId) => openTaskModal(milestoneId)}
        onCreated={load}
        onToggle={handleToggleMilestone}
        onUpdated={load}
        pendingMilestoneId={pendingMilestoneId}
        nextMilestoneId={nextMilestoneId}
        taskCounts={taskCounts}
        today={effectiveToday}
      />
      <GoalCheckIns checkIns={checkIns} onCheckIn={() => setIsCheckInOpen(true)} today={effectiveToday} />

      {isTaskOpen ? (
        <CreateTodoModal
          isOpen={isTaskOpen}
          onClose={() => setIsTaskOpen(false)}
          goalId={goal.id}
          milestoneId={selectedMilestoneId}
          onSave={() => void load()}
        />
      ) : null}
      {isCheckInOpen ? (
        <CreateCheckInModal
          isOpen={isCheckInOpen}
          onClose={() => setIsCheckInOpen(false)}
          goalId={goal.id}
          onSave={() => void load()}
        />
      ) : null}
    </AppPage>
  );
}
