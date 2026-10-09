import type { Milestone } from '@/app/types';
import { logError, StorageError, ValidationError } from '@/lib/error';
import { apiRequest, shouldQueueOfflineMutation } from './api';
import {
  addCachedRecord,
  createClientId,
  deleteCachedMilestone,
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

// Updated Milestone functions with API sync
export async function getMilestones(): Promise<Milestone[]> {
  try {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (isOnline()) {
      await syncPendingChanges();
      const milestones = await apiRequest<Milestone[]>('milestones', 'GET');
      writeCacheValue(STORAGE_KEYS.MILESTONES, userId, JSON.stringify(milestones));
      return milestones.map(milestone => unescapeData(milestone as unknown as Record<string, unknown>) as unknown as Milestone);
    }

    if (!userId) return [];

    const cachedMilestones = readCacheValue(STORAGE_KEYS.MILESTONES, userId);
    const localMilestones = JSON.parse(cachedMilestones || '[]');
    return localMilestones.map((milestone: Record<string, unknown>) => unescapeData(milestone));
  } catch (error) {
    logError(error as Error, { operation: 'getMilestones' });
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const cachedMilestones = readCacheValue(STORAGE_KEYS.MILESTONES, userId);
    const localMilestones = JSON.parse(cachedMilestones || '[]');
    return localMilestones.map((milestone: Record<string, unknown>) => unescapeData(milestone));
  }
}
export async function getMilestone(id: string): Promise<Milestone | null> {
  try {
    const milestones = await getMilestones();
    return milestones.find(milestone => milestone.id === id) || null;
  } catch (error) {
    logError(error as Error, { operation: 'getMilestone', milestoneId: id });
    // Fallback to local storage
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const cachedMilestones = readCacheValue(STORAGE_KEYS.MILESTONES, userId);
    const localMilestones = JSON.parse(cachedMilestones || '[]');
    const localMilestone = localMilestones.find((milestone: Milestone) => milestone.id === id);
    return localMilestone ? unescapeData(localMilestone as unknown as Record<string, unknown>) as unknown as Milestone : null;
  }
}

export async function createMilestone(milestone: Omit<Milestone, 'id' | 'createdAt' | 'updatedAt'>): Promise<Milestone> {
  try {
    const sanitizedMilestone = sanitizeData(milestone);

    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);

    if (!sanitizedMilestone.goalId || !sanitizedMilestone.title || !sanitizedMilestone.date) {
      throw new ValidationError('Missing required fields');
    }

      if (isOnline()) {
        try {
        await syncPendingChanges();
        const newMilestone = await apiRequest<Milestone>('milestones', 'POST', sanitizedMilestone);
        addCachedRecord(STORAGE_KEYS.MILESTONES, userId, newMilestone);
        return unescapeData(newMilestone as unknown as Record<string, unknown>) as unknown as Milestone;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          logError(error as Error, { operation: 'createMilestoneOnlineFallback' });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

      const newMilestone = {
        ...sanitizedMilestone,
        id: createClientId('temp_milestone'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      addCachedRecord(STORAGE_KEYS.MILESTONES, userId, newMilestone);
      enqueueMutation(userId, {
        resource: 'milestones',
        method: 'POST',
        entityId: newMilestone.id,
        body: sanitizedMilestone,
      });
      return unescapeData(newMilestone as unknown as Record<string, unknown>) as unknown as Milestone;
  } catch (error) {
    logError(error as Error, { operation: 'createMilestone' });
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new StorageError('Failed to create milestone');
  }
}

export async function updateMilestone(id: string, updates: Partial<Milestone>): Promise<Milestone> {
  try {
    const sanitizedUpdates = sanitizeData(updates);

    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);

      if (isOnline()) {
        try {
        await syncPendingChanges();
        const updatedMilestone = await apiRequest<Milestone>('milestones', 'PUT', { id, ...sanitizedUpdates });
        updateCachedRecord(STORAGE_KEYS.MILESTONES, userId, id, updatedMilestone);
        return unescapeData(updatedMilestone as unknown as Record<string, unknown>) as unknown as Milestone;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          logError(error as Error, { operation: 'updateMilestoneOnlineFallback', milestoneId: id });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

    const cachedMilestones = readCacheValue(STORAGE_KEYS.MILESTONES, userId);
    const milestones = JSON.parse(cachedMilestones || '[]');
    const existingMilestone = milestones.find((milestone: Milestone) => milestone.id === id);
    if (!existingMilestone) {
      throw new StorageError('Milestone not found');
    }
      const updatedMilestone = { ...existingMilestone, ...sanitizedUpdates, updatedAt: new Date().toISOString() };
      updateCachedRecord(STORAGE_KEYS.MILESTONES, userId, id, updatedMilestone);
      enqueueMutation(userId, {
        resource: 'milestones',
        method: 'PUT',
        entityId: id,
        body: sanitizedUpdates,
      });
      return unescapeData(updatedMilestone as unknown as Record<string, unknown>) as unknown as Milestone;
  } catch (error) {
    logError(error as Error, { operation: 'updateMilestone', milestoneId: id });
    throw new StorageError('Failed to update milestone');
  }
}

export async function deleteMilestone(id: string): Promise<boolean> {
  try {
      const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
      let shouldQueueDelete = !isOnline();
      if (isOnline()) {
        try {
        await syncPendingChanges();
        await apiRequest<{ success: true }>(`milestones?id=${id}`, 'DELETE');
        shouldQueueDelete = false;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          shouldQueueDelete = true;
          logError(error as Error, { operation: 'deleteMilestoneOnlineFallback', milestoneId: id });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

      deleteCachedMilestone(userId, id);
      if (shouldQueueDelete) {
        enqueueMutation(userId, {
          resource: 'milestones',
          method: 'DELETE',
          entityId: id,
        });
      }
      return true;
  } catch (error) {
    logError(error as Error, { operation: 'deleteMilestone', milestoneId: id });
    throw new StorageError('Failed to delete milestone');
  }
}
