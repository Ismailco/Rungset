import { StorageError } from '@/lib/error';
import { isOnline } from './cache';

// Add type for API error response
type ApiErrorResponse = {
  error: string;
};

export class ApiRequestError extends StorageError {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}
const API_REQUEST_TIMEOUT_MS = 15_000;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

export function shouldQueueOfflineMutation(error: unknown): boolean {
  if (!isOnline()) return true;
  if (error instanceof TypeError) return true;
  return error instanceof ApiRequestError && error.statusCode >= 500;
}

async function performApiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  data?: unknown
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    API_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`/api/${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });

    let responseData;
    try {
      responseData = await response.json();
    } catch {
      throw new StorageError('Invalid response format');
    }

    if (!response.ok) {
      const errorData = responseData as ApiErrorResponse;
      throw new ApiRequestError(errorData.error || 'API request failed', response.status);
    }

    return responseData as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new StorageError('The request timed out. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function apiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  data?: unknown,
): Promise<T> {
  if (method !== 'GET') {
    return performApiRequest<T>(endpoint, method, data);
  }

  const requestKey = `${method}:${endpoint}`;
  const inFlightRequest = inFlightGetRequests.get(requestKey);
  if (inFlightRequest) return inFlightRequest as Promise<T>;

  const request = performApiRequest<T>(endpoint, method);
  inFlightGetRequests.set(requestKey, request);

  try {
    return await request;
  } finally {
    if (inFlightGetRequests.get(requestKey) === request) {
      inFlightGetRequests.delete(requestKey);
    }
  }
}
