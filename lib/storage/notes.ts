import type { Note } from '@/app/types';
import { logError, StorageError, ValidationError } from '@/lib/error';
import { apiRequest, shouldQueueOfflineMutation } from './api';
import {
  addCachedRecord,
  createClientId,
  deleteCachedRecord,
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

// Updated Note functions with API sync
export async function getNotes(): Promise<Note[]> {
  try {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (isOnline()) {
      await syncPendingChanges();
      const notes = await apiRequest<Note[]>('notes', 'GET');
      writeCacheValue(STORAGE_KEYS.NOTES, userId, JSON.stringify(notes));
      return notes.map(note => unescapeData(note as unknown as Record<string, unknown>) as unknown as Note);
    }

    if (!userId) return [];

    const cachedNotes = readCacheValue(STORAGE_KEYS.NOTES, userId);
    const localNotes = JSON.parse(cachedNotes || '[]');
    return localNotes.map((note: Record<string, unknown>) => unescapeData(note));
  } catch (error) {
    logError(error as Error, { operation: 'getNotes' });
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const cachedNotes = readCacheValue(STORAGE_KEYS.NOTES, userId);
    const localNotes = JSON.parse(cachedNotes || '[]');
    return localNotes.map((note: Record<string, unknown>) => unescapeData(note));
  }
}
export async function getNote(id: string): Promise<Note | null> {
  try {
    const notes = await getNotes();
    return notes.find(note => note.id === id) || null;
  } catch (error) {
    logError(error as Error, { operation: 'getNote', noteId: id });
    // Fallback to local storage
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const cachedNotes = readCacheValue(STORAGE_KEYS.NOTES, userId);
    const localNotes = JSON.parse(cachedNotes || '[]');
    const localNote = localNotes.find((note: Note) => note.id === id);
    return localNote ? unescapeData(localNote as unknown as Record<string, unknown>) as unknown as Note : null;
  }
}

export async function createNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
  try {
    const sanitizedNote = sanitizeData(note);

    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);

    if (!sanitizedNote.title || !sanitizedNote.content) {
      throw new ValidationError('Title and content are required');
    }

      if (isOnline()) {
        try {
        await syncPendingChanges();
        const newNote = await apiRequest<Note>('notes', 'POST', {
          ...sanitizedNote,
          isPinned: sanitizedNote.isPinned ?? false
        });
        addCachedRecord(STORAGE_KEYS.NOTES, userId, newNote);
        return unescapeData(newNote as unknown as Record<string, unknown>) as unknown as Note;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          logError(error as Error, { operation: 'createNoteOnlineFallback' });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

      const newNote = {
        ...sanitizedNote,
        id: createClientId('temp_note'),
        isPinned: sanitizedNote.isPinned ?? false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      addCachedRecord(STORAGE_KEYS.NOTES, userId, newNote);
      enqueueMutation(userId, {
        resource: 'notes',
        method: 'POST',
        entityId: newNote.id,
        body: {
          ...sanitizedNote,
          isPinned: sanitizedNote.isPinned ?? false,
        },
      });
      return unescapeData(newNote as unknown as Record<string, unknown>) as unknown as Note;
  } catch (error) {
    logError(error as Error, { operation: 'createNote' });
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new StorageError('Failed to create note');
  }
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<Note> {
  try {
    const sanitizedUpdates = sanitizeData(updates);

    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);

      if (isOnline()) {
        try {
        await syncPendingChanges();
        const updatedNote = await apiRequest<Note>('notes', 'PUT', { id, ...sanitizedUpdates });
        updateCachedRecord(STORAGE_KEYS.NOTES, userId, id, updatedNote);
        return unescapeData(updatedNote as unknown as Record<string, unknown>) as unknown as Note;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          logError(error as Error, { operation: 'updateNoteOnlineFallback', noteId: id });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

    const cachedNotes = readCacheValue(STORAGE_KEYS.NOTES, userId);
    const notes = JSON.parse(cachedNotes || '[]');
    const existingNote = notes.find((note: Note) => note.id === id);
    if (!existingNote) {
      throw new StorageError('Note not found');
    }
      const updatedNote = { ...existingNote, ...sanitizedUpdates, updatedAt: new Date().toISOString() };
      updateCachedRecord(STORAGE_KEYS.NOTES, userId, id, updatedNote);
      enqueueMutation(userId, {
        resource: 'notes',
        method: 'PUT',
        entityId: id,
        body: sanitizedUpdates,
      });
      return unescapeData(updatedNote as unknown as Record<string, unknown>) as unknown as Note;
  } catch (error) {
    logError(error as Error, { operation: 'updateNote', noteId: id });
    throw new StorageError('Failed to update note');
  }
}

export async function deleteNote(id: string): Promise<boolean> {
  try {
      const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
      let shouldQueueDelete = !isOnline();
      if (isOnline()) {
        try {
        await syncPendingChanges();
        await apiRequest<{ success: true }>(`notes?id=${id}`, 'DELETE');
        shouldQueueDelete = false;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          shouldQueueDelete = true;
          logError(error as Error, { operation: 'deleteNoteOnlineFallback', noteId: id });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

      deleteCachedRecord(STORAGE_KEYS.NOTES, userId, id);
      if (shouldQueueDelete) {
        enqueueMutation(userId, {
          resource: 'notes',
          method: 'DELETE',
          entityId: id,
        });
      }
      return true;
  } catch (error) {
    logError(error as Error, { operation: 'deleteNote', noteId: id });
    throw new StorageError('Failed to delete note');
  }
}
