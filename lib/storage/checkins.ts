import type { CheckIn } from '@/app/types';
import { logError, StorageError, ValidationError } from '@/lib/error';
import { apiRequest, shouldQueueOfflineMutation } from './api';
import {
  addCachedRecord,
  createClientId,
  deleteCachedRecord,
  enqueueMutation,
  isOnline,
  normalizeCheckInArray,
  readCacheValue,
  sanitizeData,
  STORAGE_KEYS,
  unescapeData,
  updateCachedRecord,
  writeCacheValue,
} from './cache';
import { syncPendingChanges } from './sync';

// Updated CheckIn functions with API sync
export async function getCheckIns(): Promise<CheckIn[]> {
  try {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (isOnline()) {
      await syncPendingChanges();
      const checkIns = await apiRequest<CheckIn[]>('checkins', 'GET');
      writeCacheValue(STORAGE_KEYS.CHECKINS, userId, JSON.stringify(checkIns));
      return checkIns.map(checkIn => unescapeData(checkIn as unknown as Record<string, unknown>) as unknown as CheckIn);
    }

    if (!userId) return [];

    const cachedCheckIns = readCacheValue(STORAGE_KEYS.CHECKINS, userId);
    const localCheckIns = JSON.parse(cachedCheckIns || '[]');
    return localCheckIns.map((checkIn: Record<string, unknown>) => unescapeData(checkIn));
  } catch (error) {
    logError(error as Error, { operation: 'getCheckIns' });
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const cachedCheckIns = readCacheValue(STORAGE_KEYS.CHECKINS, userId);
    const localCheckIns = JSON.parse(cachedCheckIns || '[]');
    return localCheckIns.map((checkIn: Record<string, unknown>) => unescapeData(checkIn));
  }
}

export async function getCheckIn(id: string): Promise<CheckIn | null> {
  try {
    const checkIns = await getCheckIns();
    return checkIns.find(checkIn => checkIn.id === id) || null;
  } catch (error) {
    logError(error as Error, { operation: 'getCheckIn', checkInId: id });
    // Fallback to local storage
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const cachedCheckIns = readCacheValue(STORAGE_KEYS.CHECKINS, userId);
    const localCheckIns = JSON.parse(cachedCheckIns || '[]');
    const localCheckIn = localCheckIns.find((checkIn: CheckIn) => checkIn.id === id);
    return localCheckIn ? unescapeData(localCheckIn as unknown as Record<string, unknown>) as unknown as CheckIn : null;
  }
}

export async function getCheckInByDate(date: string): Promise<CheckIn | null> {
  try {
    const checkIns = await getCheckIns();
    return checkIns.find(checkIn => checkIn.date === date) || null;
  } catch (error) {
    logError(error as Error, { operation: 'getCheckInByDate', date });
    // Fallback to local storage
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const cachedCheckIns = readCacheValue(STORAGE_KEYS.CHECKINS, userId);
    const localCheckIns = JSON.parse(cachedCheckIns || '[]');
    const localCheckIn = localCheckIns.find((checkIn: CheckIn) => checkIn.date === date);
    return localCheckIn ? unescapeData(localCheckIn as unknown as Record<string, unknown>) as unknown as CheckIn : null;
  }
}

export async function createCheckIn(checkIn: Omit<CheckIn, 'id' | 'createdAt' | 'updatedAt'>): Promise<CheckIn> {
  try {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const processedData = {
      ...checkIn,
      accomplishments: normalizeCheckInArray(checkIn.accomplishments),
      challenges: normalizeCheckInArray(checkIn.challenges),
      goals: normalizeCheckInArray(checkIn.goals),
    };

    const sanitizedCheckIn = sanitizeData(processedData);

    const requiredFields = ['date', 'mood', 'energy', 'accomplishments', 'challenges', 'goals'] as const;
    const missingFields = requiredFields.filter(field => !sanitizedCheckIn[field]);

    if (missingFields.length > 0) {
      throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const validMoods = ['great', 'good', 'okay', 'bad', 'terrible'] as const;
    const validEnergies = ['high', 'medium', 'low'] as const;

    if (
      typeof sanitizedCheckIn.mood !== 'string' ||
      !validMoods.includes(sanitizedCheckIn.mood as (typeof validMoods)[number])
    ) {
      throw new ValidationError(`Invalid mood value. Must be one of: ${validMoods.join(', ')}`);
    }

    if (
      typeof sanitizedCheckIn.energy !== 'string' ||
      !validEnergies.includes(sanitizedCheckIn.energy as (typeof validEnergies)[number])
    ) {
      throw new ValidationError(`Invalid energy value. Must be one of: ${validEnergies.join(', ')}`);
    }

      if (isOnline()) {
        try {
        await syncPendingChanges();
        const newCheckIn = await apiRequest<CheckIn>('checkins', 'POST', sanitizedCheckIn);
        addCachedRecord(STORAGE_KEYS.CHECKINS, userId, newCheckIn);
        return unescapeData(newCheckIn as unknown as Record<string, unknown>) as unknown as CheckIn;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          logError(error as Error, { operation: 'createCheckInOnlineFallback' });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

      const newCheckIn = {
        ...sanitizedCheckIn,
        id: createClientId('temp_checkin'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      addCachedRecord(STORAGE_KEYS.CHECKINS, userId, newCheckIn);
      enqueueMutation(userId, {
        resource: 'checkins',
        method: 'POST',
        entityId: newCheckIn.id,
        body: sanitizedCheckIn,
      });
      return unescapeData(newCheckIn as unknown as Record<string, unknown>) as unknown as CheckIn;
  } catch (error) {
    logError(error as Error, { operation: 'createCheckIn' });
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new StorageError('Failed to create check-in');
  }
}

export async function updateCheckIn(id: string, updates: Partial<CheckIn>): Promise<CheckIn> {
  try {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const processedUpdates = {
      ...updates,
      ...(updates.accomplishments !== undefined && { accomplishments: normalizeCheckInArray(updates.accomplishments) }),
      ...(updates.challenges !== undefined && { challenges: normalizeCheckInArray(updates.challenges) }),
      ...(updates.goals !== undefined && { goals: normalizeCheckInArray(updates.goals) }),
    };

    const sanitizedUpdates = sanitizeData(processedUpdates);

      if (isOnline()) {
        try {
        await syncPendingChanges();
        const updatedCheckIn = await apiRequest<CheckIn>('checkins', 'PUT', { id, ...sanitizedUpdates });
        updateCachedRecord(STORAGE_KEYS.CHECKINS, userId, id, updatedCheckIn);
        return unescapeData(updatedCheckIn as unknown as Record<string, unknown>) as unknown as CheckIn;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          logError(error as Error, { operation: 'updateCheckInOnlineFallback', checkInId: id });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

    const cachedCheckIns = readCacheValue(STORAGE_KEYS.CHECKINS, userId);
    const checkIns = JSON.parse(cachedCheckIns || '[]');
    const existingCheckIn = checkIns.find((checkIn: CheckIn) => checkIn.id === id);
    if (!existingCheckIn) {
      throw new StorageError('Check-in not found');
    }
      const updatedCheckIn = { ...existingCheckIn, ...sanitizedUpdates, updatedAt: new Date().toISOString() };
      updateCachedRecord(STORAGE_KEYS.CHECKINS, userId, id, updatedCheckIn);
      enqueueMutation(userId, {
        resource: 'checkins',
        method: 'PUT',
        entityId: id,
        body: sanitizedUpdates,
      });
      return unescapeData(updatedCheckIn as unknown as Record<string, unknown>) as unknown as CheckIn;
  } catch (error) {
    logError(error as Error, { operation: 'updateCheckIn', checkInId: id });
    throw new StorageError('Failed to update check-in');
  }
}

export async function deleteCheckIn(id: string): Promise<boolean> {
  try {
      const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
      let shouldQueueDelete = !isOnline();
      if (isOnline()) {
        try {
        await syncPendingChanges();
        await apiRequest<{ success: true }>(`checkins?id=${id}`, 'DELETE');
        shouldQueueDelete = false;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          shouldQueueDelete = true;
          logError(error as Error, { operation: 'deleteCheckInOnlineFallback', checkInId: id });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

      deleteCachedRecord(STORAGE_KEYS.CHECKINS, userId, id);
      if (shouldQueueDelete) {
        enqueueMutation(userId, {
          resource: 'checkins',
          method: 'DELETE',
          entityId: id,
        });
      }
      return true;
  } catch (error) {
    logError(error as Error, { operation: 'deleteCheckIn', checkInId: id });
    throw new StorageError('Failed to delete check-in');
  }
}
