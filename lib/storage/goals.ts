import type { Goal } from '@/app/types';
import { logError, StorageError, ValidationError } from '@/lib/error';
import { apiRequest, shouldQueueOfflineMutation } from './api';
import {
  addCachedRecord,
  createClientId,
  deleteCachedGoalCascade,
  enqueueMutation,
  isOnline,
  readCacheValue,
  sanitizeData,
  STORAGE_KEYS,
  unescapeData,
  updateCachedRecord,
  writeCacheValue,
} from './cache';
import { syncPendingChanges } from './sync';

// Updated Goal functions with API sync
export async function getGoals(): Promise<Goal[]> {
  try {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (isOnline()) {
      await syncPendingChanges();
      const goals = await apiRequest<Goal[]>('goals', 'GET');
      writeCacheValue(STORAGE_KEYS.GOALS, userId, JSON.stringify(goals));
      return goals.map(goal => unescapeData(goal as unknown as Record<string, unknown>) as unknown as Goal);
    }

    if (!userId) return [];

    const cachedGoals = readCacheValue(STORAGE_KEYS.GOALS, userId);
    const localGoals = JSON.parse(cachedGoals || '[]');
    return localGoals.map((goal: Record<string, unknown>) => unescapeData(goal));
  } catch (error) {
    logError(error as Error, { operation: 'getGoals' });
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const cachedGoals = readCacheValue(STORAGE_KEYS.GOALS, userId);
    const localGoals = JSON.parse(cachedGoals || '[]');
    return localGoals.map((goal: Record<string, unknown>) => unescapeData(goal));
  }
}
// Updated getGoal to handle async/await
export async function getGoal(id: string): Promise<Goal | null> {
  try {
    const goals = await getGoals();
    return goals.find(goal => goal.id === id) || null;
  } catch (error) {
    logError(error as Error, { operation: 'getGoal', goalId: id });
    // Fallback to local storage
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const cachedGoals = readCacheValue(STORAGE_KEYS.GOALS, userId);
    const localGoals = JSON.parse(cachedGoals || '[]');
    const localGoal = localGoals.find((goal: Goal) => goal.id === id);
    return localGoal ? unescapeData(localGoal as unknown as Record<string, unknown>) as unknown as Goal : null;
  }
}

export async function createGoal(goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>): Promise<Goal> {
  try {
    const sanitizedGoal = sanitizeData(goal);

    if (!sanitizedGoal.title) {
      throw new ValidationError('Goal title is required');
    }

      const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);

      if (isOnline()) {
        try {
        await syncPendingChanges();
        const newGoal = await apiRequest<Goal>('goals', 'POST', sanitizedGoal);
        addCachedRecord(STORAGE_KEYS.GOALS, userId, newGoal);
        return unescapeData(newGoal as unknown as Record<string, unknown>) as unknown as Goal;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          logError(error as Error, { operation: 'createGoalOnlineFallback' });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

      const newGoal = {
        ...sanitizedGoal,
        id: createClientId('temp_goal'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      addCachedRecord(STORAGE_KEYS.GOALS, userId, newGoal);
      enqueueMutation(userId, {
        resource: 'goals',
        method: 'POST',
        entityId: newGoal.id,
        body: sanitizedGoal,
      });
      return unescapeData(newGoal as unknown as Record<string, unknown>) as unknown as Goal;
  } catch (error) {
    logError(error as Error, { operation: 'createGoal' });
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new StorageError('Failed to create goal');
  }
}

export async function updateGoal(id: string, updates: Partial<Goal>): Promise<Goal> {
  try {
    const sanitizedUpdates = sanitizeData(updates);

      const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);

      if (isOnline()) {
        try {
        await syncPendingChanges();
        const updatedGoal = await apiRequest<Goal>('goals', 'PUT', { id, ...sanitizedUpdates });
        updateCachedRecord(STORAGE_KEYS.GOALS, userId, id, updatedGoal);
        return unescapeData(updatedGoal as unknown as Record<string, unknown>) as unknown as Goal;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          logError(error as Error, { operation: 'updateGoalOnlineFallback', goalId: id });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

    const cachedGoals = readCacheValue(STORAGE_KEYS.GOALS, userId);
    const goals = JSON.parse(cachedGoals || '[]');
    const existingGoal = goals.find((goal: Goal) => goal.id === id);
    if (!existingGoal) {
      throw new StorageError('Goal not found');
    }
      const updatedGoal = { ...existingGoal, ...sanitizedUpdates, updatedAt: new Date().toISOString() };
      updateCachedRecord(STORAGE_KEYS.GOALS, userId, id, updatedGoal);
      enqueueMutation(userId, {
        resource: 'goals',
        method: 'PUT',
        entityId: id,
        body: sanitizedUpdates,
      });
      return unescapeData(updatedGoal as unknown as Record<string, unknown>) as unknown as Goal;
  } catch (error) {
    logError(error as Error, { operation: 'updateGoal', goalId: id });
    throw new StorageError('Failed to update goal');
  }
}

export async function deleteGoal(id: string): Promise<boolean> {
  try {
      const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
      let shouldQueueDelete = !isOnline();
      if (isOnline()) {
        try {
        await syncPendingChanges();
        await apiRequest<{ success: true }>(`goals?id=${id}`, 'DELETE');
        shouldQueueDelete = false;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          shouldQueueDelete = true;
          logError(error as Error, { operation: 'deleteGoalOnlineFallback', goalId: id });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

      deleteCachedGoalCascade(userId, id);
      if (shouldQueueDelete) {
        enqueueMutation(userId, {
          resource: 'goals',
          method: 'DELETE',
          entityId: id,
        });
      }
      return true;
  } catch (error) {
    logError(error as Error, { operation: 'deleteGoal', goalId: id });
    throw new StorageError('Failed to delete goal');
  }
}
