import type { Todo, TodoOccurrence } from '@/app/types';
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

// Updated Todo functions with API sync
export async function getTodos(): Promise<Todo[]> {
  try {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (isOnline()) {
      await syncPendingChanges();
      const todos = await apiRequest<Todo[]>('todos', 'GET');
      writeCacheValue(STORAGE_KEYS.TODOS, userId, JSON.stringify(todos));
      return todos.map(todo => unescapeData(todo as unknown as Record<string, unknown>) as unknown as Todo);
    }

    if (!userId) return [];

    const cachedTodos = readCacheValue(STORAGE_KEYS.TODOS, userId);
    const localTodos = JSON.parse(cachedTodos || '[]');
    return localTodos.map((todo: Record<string, unknown>) => unescapeData(todo));
  } catch (error) {
    logError(error as Error, { operation: 'getTodos' });
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const cachedTodos = readCacheValue(STORAGE_KEYS.TODOS, userId);
    const localTodos = JSON.parse(cachedTodos || '[]');
    return localTodos.map((todo: Record<string, unknown>) => unescapeData(todo));
  }
}
export async function getTodoOccurrences(): Promise<TodoOccurrence[]> {
  try {
    if (isOnline()) {
      return await apiRequest<TodoOccurrence[]>('todo-occurrences', 'GET');
    }
    return [];
  } catch (error) {
    logError(error as Error, { operation: 'getTodoOccurrences' });
    return [];
  }
}

export async function getTodo(id: string): Promise<Todo | null> {
  try {
    const todos = await getTodos();
    return todos.find(todo => todo.id === id) || null;
  } catch (error) {
    logError(error as Error, { operation: 'getTodo', todoId: id });
    // Fallback to local storage
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const cachedTodos = readCacheValue(STORAGE_KEYS.TODOS, userId);
    const localTodos = JSON.parse(cachedTodos || '[]');
    const localTodo = localTodos.find((todo: Todo) => todo.id === id);
    return localTodo ? unescapeData(localTodo as unknown as Record<string, unknown>) as unknown as Todo : null;
  }
}

export async function createTodo(todo: Omit<Todo, 'id' | 'createdAt' | 'updatedAt' | 'completed'>): Promise<Todo> {
  try {
    const sanitizedTodo = sanitizeData(todo);

    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);

    if (!sanitizedTodo.title || !sanitizedTodo.priority) {
      throw new ValidationError('Title and priority are required');
    }

    if (!['low', 'medium', 'high'].includes(sanitizedTodo.priority)) {
      throw new ValidationError('Invalid priority level');
    }

      if (isOnline()) {
        try {
        await syncPendingChanges();
        const newTodo = await apiRequest<Todo>('todos', 'POST', {
          ...sanitizedTodo,
          completed: false
        });
        addCachedRecord(STORAGE_KEYS.TODOS, userId, newTodo);
        return unescapeData(newTodo as unknown as Record<string, unknown>) as unknown as Todo;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          logError(error as Error, { operation: 'createTodoOnlineFallback' });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

      const newTodo = {
        ...sanitizedTodo,
        id: createClientId('temp_todo'),
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      addCachedRecord(STORAGE_KEYS.TODOS, userId, newTodo);
      enqueueMutation(userId, {
        resource: 'todos',
        method: 'POST',
        entityId: newTodo.id,
        body: {
          ...sanitizedTodo,
          completed: false,
        },
      });
      return unescapeData(newTodo as unknown as Record<string, unknown>) as unknown as Todo;
  } catch (error) {
    logError(error as Error, { operation: 'createTodo' });
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new StorageError('Failed to create todo');
  }
}

export async function updateTodo(id: string, updates: Partial<Todo>): Promise<Todo> {
  try {
    const sanitizedUpdates = sanitizeData(updates);

    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);

    if (sanitizedUpdates.priority && !['low', 'medium', 'high'].includes(sanitizedUpdates.priority)) {
      throw new ValidationError('Invalid priority level');
    }

      if (isOnline()) {
        try {
        await syncPendingChanges();
        const updatedTodo = await apiRequest<Todo>('todos', 'PUT', { id, ...sanitizedUpdates });
        updateCachedRecord(STORAGE_KEYS.TODOS, userId, id, updatedTodo);
        return unescapeData(updatedTodo as unknown as Record<string, unknown>) as unknown as Todo;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          logError(error as Error, { operation: 'updateTodoOnlineFallback', todoId: id });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

    const cachedTodos = readCacheValue(STORAGE_KEYS.TODOS, userId);
    const todos = JSON.parse(cachedTodos || '[]');
    const existingTodo = todos.find((todo: Todo) => todo.id === id);
    if (!existingTodo) {
      throw new StorageError('Todo not found');
    }
      const updatedTodo = { ...existingTodo, ...sanitizedUpdates, updatedAt: new Date().toISOString() };
      updateCachedRecord(STORAGE_KEYS.TODOS, userId, id, updatedTodo);
      enqueueMutation(userId, {
        resource: 'todos',
        method: 'PUT',
        entityId: id,
        body: sanitizedUpdates,
      });
      return unescapeData(updatedTodo as unknown as Record<string, unknown>) as unknown as Todo;
  } catch (error) {
    logError(error as Error, { operation: 'updateTodo', todoId: id });
    throw new StorageError('Failed to update todo');
  }
}

export async function deleteTodo(id: string): Promise<boolean> {
  try {
      const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
      let shouldQueueDelete = !isOnline();
      if (isOnline()) {
        try {
        await syncPendingChanges();
        await apiRequest<{ success: true }>(`todos?id=${id}`, 'DELETE');
        shouldQueueDelete = false;
        } catch (error) {
          if (!shouldQueueOfflineMutation(error)) {
            throw error;
          }
          shouldQueueDelete = true;
          logError(error as Error, { operation: 'deleteTodoOnlineFallback', todoId: id });
        }
      }

    if (!userId) {
      throw new StorageError('No user ID found');
    }

      deleteCachedRecord(STORAGE_KEYS.TODOS, userId, id);
      if (shouldQueueDelete) {
        enqueueMutation(userId, {
          resource: 'todos',
          method: 'DELETE',
          entityId: id,
        });
      }
      return true;
  } catch (error) {
    logError(error as Error, { operation: 'deleteTodo', todoId: id });
    throw new StorageError('Failed to delete todo');
  }
}

export async function toggleTodoComplete(id: string): Promise<Todo> {
  try {
    const todo = await getTodo(id);
    if (!todo) {
      throw new ValidationError('Todo not found');
    }
    return updateTodo(id, { completed: !todo.completed });
  } catch (error) {
    logError(error as Error, { operation: 'toggleTodoComplete', todoId: id });
    throw new StorageError('Failed to toggle todo completion');
  }
}
