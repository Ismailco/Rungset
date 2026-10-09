import type { CheckIn, Goal, Milestone, Note, Todo } from '@/app/types';
import { logError } from '@/lib/error';
import { ApiRequestError, apiRequest } from './api';
import {
  deleteCachedGoalCascade,
  deleteCachedRecord,
  isOnline,
  readSyncQueue,
  replaceTempReferences,
  resolveMutationBody,
  resolveTempId,
  RESOURCE_STORAGE_KEYS,
  STORAGE_KEYS,
  updateCachedRecord,
  writeCacheValue,
  writeSyncQueue,
  type CachedRecord,
  type PendingMutation,
} from './cache';

interface SyncResult {
  synced: number;
  failed: number;
  pending: number;
}
async function refreshRemoteCache(userId: string | null): Promise<void> {
  if (!userId) return;

  const [goals, milestones, notes, todos, checkIns] = await Promise.all([
    apiRequest<Goal[]>('goals', 'GET'),
    apiRequest<Milestone[]>('milestones', 'GET'),
    apiRequest<Note[]>('notes', 'GET'),
    apiRequest<Todo[]>('todos', 'GET'),
    apiRequest<CheckIn[]>('checkins', 'GET'),
  ]);

  writeCacheValue(STORAGE_KEYS.GOALS, userId, JSON.stringify(goals));
  writeCacheValue(STORAGE_KEYS.MILESTONES, userId, JSON.stringify(milestones));
  writeCacheValue(STORAGE_KEYS.NOTES, userId, JSON.stringify(notes));
  writeCacheValue(STORAGE_KEYS.TODOS, userId, JSON.stringify(todos));
  writeCacheValue(STORAGE_KEYS.CHECKINS, userId, JSON.stringify(checkIns));
}

export async function syncWorkspaceData(): Promise<SyncResult> {
  const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
  const queue = readSyncQueue(userId);

  if (!userId || !isOnline()) {
    return { synced: 0, failed: 0, pending: queue.length };
  }

  const result = await syncPendingChanges();

  if (result.pending === 0) {
    await refreshRemoteCache(userId);
  }

  return result;
}


let syncInProgress = false;

export async function syncPendingChanges(): Promise<SyncResult> {
  const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
  const queue = readSyncQueue(userId);

  if (!userId || queue.length === 0) {
    return { synced: 0, failed: 0, pending: 0 };
  }

  if (!isOnline()) {
    return { synced: 0, failed: 0, pending: queue.length };
  }

  if (syncInProgress) {
    return { synced: 0, failed: 0, pending: queue.length };
  }

  syncInProgress = true;

  const idMap: Record<string, string> = {};
  let synced = 0;
  let remainingQueue: PendingMutation[] = [];

  try {
    for (let index = 0; index < queue.length; index += 1) {
      const mutation = queue[index];
      const endpoint = mutation.resource;
      const storageKey = RESOURCE_STORAGE_KEYS[mutation.resource];
      const entityId = resolveTempId(mutation.entityId, idMap);
      const body = resolveMutationBody(mutation.body, idMap);

      try {
        if (mutation.method === 'POST') {
          const createdRecord = await apiRequest<CachedRecord>(endpoint, 'POST', body);
          idMap[mutation.entityId] = createdRecord.id;
          updateCachedRecord(storageKey, userId, mutation.entityId, createdRecord);
          replaceTempReferences(userId, mutation.entityId, createdRecord.id);
        } else if (mutation.method === 'PUT') {
          const updatedRecord = await apiRequest<CachedRecord>(endpoint, 'PUT', {
            ...body,
            id: entityId,
          });
          updateCachedRecord(storageKey, userId, mutation.entityId, updatedRecord);
          if (entityId !== mutation.entityId) {
            updateCachedRecord(storageKey, userId, entityId, updatedRecord);
          }
        } else {
          await apiRequest<{ success: true }>(
            `${endpoint}?id=${encodeURIComponent(entityId)}`,
            'DELETE',
          );
          if (mutation.resource === 'goals') {
            deleteCachedGoalCascade(userId, mutation.entityId);
            if (entityId !== mutation.entityId) {
              deleteCachedGoalCascade(userId, entityId);
            }
          } else {
            deleteCachedRecord(storageKey, userId, mutation.entityId);
            if (entityId !== mutation.entityId) {
              deleteCachedRecord(storageKey, userId, entityId);
            }
          }
        }

        synced += 1;
      } catch (error) {
        if (
          error instanceof ApiRequestError &&
          error.statusCode === 404 &&
          mutation.method !== 'POST'
        ) {
          if (mutation.resource === 'goals') {
            deleteCachedGoalCascade(userId, mutation.entityId);
          } else {
            deleteCachedRecord(storageKey, userId, mutation.entityId);
          }
          synced += 1;
          continue;
        }

    logError(error as Error, {
      operation: 'syncPendingChanges',
      resource: mutation.resource,
      method: mutation.method,
      entityId: mutation.entityId,
    });
        remainingQueue = queue.slice(index);
        break;
      }
    }

    writeSyncQueue(userId, remainingQueue);

    if (synced > 0 && remainingQueue.length === 0) {
      await refreshRemoteCache(userId);
    }

    return {
      synced,
      failed: remainingQueue.length > 0 ? 1 : 0,
      pending: remainingQueue.length,
    };
  } finally {
    syncInProgress = false;
  }
}
