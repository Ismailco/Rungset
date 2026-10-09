import type { CheckIn, Milestone, Todo } from '@/app/types';
import { sanitizeForStorage } from '@/lib/validation';
import validator from 'validator';

// Helper function to check online status
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

// Helper function to sanitize data before storage
export const sanitizeData = <T extends Record<string, unknown>>(data: T): T => {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      sanitized[key] = value.map(item => typeof item === 'string' ? sanitizeForStorage(item) : item);
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeForStorage(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
};

// Helper function to unescape data when retrieving
export const unescapeData = <T extends Record<string, unknown>>(data: T): T => {
  const unescaped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      unescaped[key] = value.map(item => typeof item === 'string' ? validator.unescape(item) : item);
    } else if (typeof value === 'string') {
      unescaped[key] = validator.unescape(value);
    } else {
      unescaped[key] = value;
    }
  }
  return unescaped as T;
};

export function normalizeCheckInArray(value: string[] | string | undefined | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed: unknown = JSON.parse(validator.unescape(value));
    return Array.isArray(parsed) && parsed.every((item): item is string => typeof item === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export const STORAGE_KEYS = {
  GOALS: 'goals',
  MILESTONES: 'milestones',
  NOTES: 'notes',
  TODOS: 'todos',
  CHECKINS: 'checkins',
  USER_ID: 'userId',
  SYNC_QUEUE: 'syncQueue',
};

export type ResourceName = 'goals' | 'milestones' | 'notes' | 'todos' | 'checkins';
export type MutationMethod = 'POST' | 'PUT' | 'DELETE';
export type CachedRecord = Record<string, unknown> & { id: string };

export interface PendingMutation {
  id: string;
  userId: string;
  resource: ResourceName;
  method: MutationMethod;
  entityId: string;
  body?: Record<string, unknown>;
  createdAt: string;
}

export const RESOURCE_STORAGE_KEYS: Record<ResourceName, string> = {
  goals: STORAGE_KEYS.GOALS,
  milestones: STORAGE_KEYS.MILESTONES,
  notes: STORAGE_KEYS.NOTES,
  todos: STORAGE_KEYS.TODOS,
  checkins: STORAGE_KEYS.CHECKINS,
};

function getScopedKey(baseKey: string, userId: string): string {
  return `${baseKey}:${userId}`;
}

export function readCacheValue(baseKey: string, userId: string | null): string | null {
  if (!userId) return null;

  const scopedKey = getScopedKey(baseKey, userId);
  const scopedValue = localStorage.getItem(scopedKey);
  if (scopedValue !== null) return scopedValue;

  const legacyValue = localStorage.getItem(baseKey);
  if (legacyValue !== null) {
    localStorage.setItem(scopedKey, legacyValue);
    localStorage.removeItem(baseKey);
    return legacyValue;
  }

  return null;
}

export function writeCacheValue(baseKey: string, userId: string | null, value: string): void {
  if (!userId) return;
  localStorage.setItem(getScopedKey(baseKey, userId), value);
  localStorage.removeItem(baseKey);
}

export function clearUserCache(userId: string): void {
  const baseKeys = [
    STORAGE_KEYS.GOALS,
    STORAGE_KEYS.MILESTONES,
    STORAGE_KEYS.NOTES,
    STORAGE_KEYS.TODOS,
    STORAGE_KEYS.CHECKINS,
    STORAGE_KEYS.SYNC_QUEUE,
  ];

  for (const baseKey of baseKeys) {
    localStorage.removeItem(getScopedKey(baseKey, userId));
    localStorage.removeItem(baseKey);
  }

  if (localStorage.getItem(STORAGE_KEYS.USER_ID) === userId) {
    localStorage.removeItem(STORAGE_KEYS.USER_ID);
  }
}

export async function clearOfflineCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;

  const cacheKeys = await caches.keys();
  await Promise.all(
    cacheKeys
      .filter(
        (cacheKey) =>
          cacheKey.startsWith('goalgenius-') || cacheKey.startsWith('rungset-'),
      )
      .map((cacheKey) => caches.delete(cacheKey)),
  );
  localStorage.removeItem('pwaCacheReady');
  localStorage.removeItem('pwaCacheVersion');
}

export function createClientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function readCachedList<T extends { id: string }>(
  baseKey: string,
  userId: string | null,
): T[] {
  const cachedValue = readCacheValue(baseKey, userId);
  return JSON.parse(cachedValue || '[]') as T[];
}

export function writeCachedList<T extends { id: string }>(
  baseKey: string,
  userId: string | null,
  records: T[],
): void {
  writeCacheValue(baseKey, userId, JSON.stringify(records));
}

export function addCachedRecord<T extends { id: string }>(
  baseKey: string,
  userId: string | null,
  record: T,
): void {
  const records = readCachedList<T>(baseKey, userId);
  writeCachedList(baseKey, userId, [...records, record]);
}

export function updateCachedRecord<T extends { id: string }>(
  baseKey: string,
  userId: string | null,
  id: string,
  record: T,
): void {
  const records = readCachedList<T>(baseKey, userId);
  writeCachedList(
    baseKey,
    userId,
    records.map((currentRecord) => currentRecord.id === id ? record : currentRecord),
  );
}

export function deleteCachedRecord<T extends { id: string }>(
  baseKey: string,
  userId: string | null,
  id: string,
): void {
  const records = readCachedList<T>(baseKey, userId);
  writeCachedList(
    baseKey,
    userId,
    records.filter((record) => record.id !== id),
  );
}

export function deleteCachedGoalCascade(userId: string | null, goalId: string): void {
  deleteCachedRecord(STORAGE_KEYS.GOALS, userId, goalId);

  const milestones = readCachedList<Milestone>(STORAGE_KEYS.MILESTONES, userId);
  writeCachedList(
    STORAGE_KEYS.MILESTONES,
    userId,
  milestones.filter((milestone) => milestone.goalId !== goalId),
  );

  const todos = readCachedList<Todo>(STORAGE_KEYS.TODOS, userId);
  writeCachedList(STORAGE_KEYS.TODOS, userId, todos.filter((todo) => todo.goalId !== goalId));

  const checkIns = readCachedList<CheckIn>(STORAGE_KEYS.CHECKINS, userId);
  writeCachedList(STORAGE_KEYS.CHECKINS, userId, checkIns.filter((checkIn) => checkIn.goalId !== goalId));
}

export function deleteCachedMilestone(userId: string | null, milestoneId: string): void {
  deleteCachedRecord(STORAGE_KEYS.MILESTONES, userId, milestoneId);
  const todos = readCachedList<Todo>(STORAGE_KEYS.TODOS, userId);
  writeCachedList(STORAGE_KEYS.TODOS, userId, todos.map((todo) => (
    todo.milestoneId === milestoneId ? { ...todo, milestoneId: null } : todo
  )));
}

export function readSyncQueue(userId: string | null): PendingMutation[] {
  if (!userId) return [];

  try {
    const queueValue = readCacheValue(STORAGE_KEYS.SYNC_QUEUE, userId);
    const parsedQueue = JSON.parse(queueValue || '[]');
    return Array.isArray(parsedQueue) ? parsedQueue : [];
  } catch {
    return [];
  }
}

export function writeSyncQueue(userId: string | null, queue: PendingMutation[]): void {
  if (!userId) return;
  writeCacheValue(STORAGE_KEYS.SYNC_QUEUE, userId, JSON.stringify(queue));
}

export function enqueueMutation(
  userId: string | null,
  mutation: Omit<PendingMutation, 'id' | 'userId' | 'createdAt'>,
): void {
  if (!userId) return;

  const queue = readSyncQueue(userId);
  writeSyncQueue(userId, [
    ...queue,
    {
      ...mutation,
      id: createClientId('mutation'),
      userId,
      createdAt: new Date().toISOString(),
    },
  ]);
}

export function resolveTempId(id: string, idMap: Record<string, string>): string {
  return idMap[id] ?? id;
}

export function resolveMutationBody(
  body: Record<string, unknown> | undefined,
  idMap: Record<string, string>,
): Record<string, unknown> | undefined {
  if (!body) return undefined;

  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      typeof value === 'string' ? resolveTempId(value, idMap) : value,
    ]),
  );
}

export function replaceTempReferences(userId: string | null, oldId: string, newId: string): void {
  if (!userId) return;

  for (const baseKey of Object.values(RESOURCE_STORAGE_KEYS)) {
    const records = readCachedList<CachedRecord>(baseKey, userId);
    const nextRecords = records.map((record) => {
      const nextRecord = { ...record };

      if (nextRecord.id === oldId) {
        nextRecord.id = newId;
      }

      if (nextRecord.goalId === oldId) {
        nextRecord.goalId = newId;
      }

      return nextRecord;
    });

    writeCachedList(baseKey, userId, nextRecords);
  }
}
