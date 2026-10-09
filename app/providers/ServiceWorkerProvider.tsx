'use client';

import { useEffect } from 'react';
import { syncWorkspaceData } from '@/lib/storage';
import { WORKSPACE_SYNC_EVENT } from '@/lib/workspace-sync-events';

const PWA_CACHE_VERSION = 'v6';
const PWA_CACHE_VERSION_KEY = 'pwaCacheVersion';
const isProductionBuild = process.env.NODE_ENV === 'production';
let activePageCacheRequest: Promise<boolean> | null = null;

export const cacheAppPages = async (): Promise<boolean> => {
  if (!isProductionBuild) {
    return false;
  }

  if (!('serviceWorker' in navigator)) {
    return Promise.reject(new Error('Service Worker unsupported'));
  }

  if (activePageCacheRequest) {
    return activePageCacheRequest;
  }

  const cacheRequest = (async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const serviceWorker = navigator.serviceWorker.controller ?? registration.active;

      if (!serviceWorker) {
        throw new Error('Service Worker not ready');
      }

      return await new Promise<boolean>((resolve, reject) => {
        const messageHandler = (event: MessageEvent) => {
          if (event.data?.type === 'CACHE_COMPLETE') {
            navigator.serviceWorker.removeEventListener('message', messageHandler);
            if (event.data.success) {
              localStorage.setItem('pwaCacheReady', 'true');
              localStorage.setItem(
                PWA_CACHE_VERSION_KEY,
                event.data.version ?? PWA_CACHE_VERSION,
              );
              resolve(true);
            } else {
              console.warn('⚠️ Some pages failed to cache:', event.data.failedUrls);
              resolve(false);
            }
          } else if (event.data?.type === 'CACHE_ERROR') {
            navigator.serviceWorker.removeEventListener('message', messageHandler);
            console.error('❌ Cache error:', event.data.error);
            reject(new Error(event.data.error));
          }
        };
        navigator.serviceWorker.addEventListener('message', messageHandler);
        serviceWorker.postMessage({ type: 'CACHE_PAGES' });
      });
    } catch (error) {
      console.error('Failed to initiate caching:', error);
      throw error;
    }
  })();

  activePageCacheRequest = cacheRequest;
  void cacheRequest.then(
    () => {
      if (activePageCacheRequest === cacheRequest) {
        activePageCacheRequest = null;
      }
    },
    () => {
      if (activePageCacheRequest === cacheRequest) {
        activePageCacheRequest = null;
      }
    },
  );

  return cacheRequest;
};

async function disableDevelopmentServiceWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter(
          (cacheKey) =>
            cacheKey.startsWith('goalgenius-') || cacheKey.startsWith('rungset-'),
        )
        .map((cacheKey) => caches.delete(cacheKey)),
    );
  }

  localStorage.removeItem('pwaCacheReady');
  localStorage.removeItem(PWA_CACHE_VERSION_KEY);
}

export default function ServiceWorkerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const syncPendingWorkspaceChanges = async () => {
      if (navigator.onLine) {
        try {
          await syncWorkspaceData();
          window.dispatchEvent(new Event(WORKSPACE_SYNC_EVENT));
        } catch (error) {
          console.warn('Offline changes could not be synced yet:', error);
        }
      }
    };

    if ('serviceWorker' in navigator) {
      if (!isProductionBuild) {
        void disableDevelopmentServiceWorkers().catch((error) => {
          console.warn('Development service worker cleanup failed:', error);
        });
      } else {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            if (!reg) return;

            void syncPendingWorkspaceChanges();
          })
          .catch((err) => console.error('❌ SW registration failed:', err));
      }
    }

    const handleOnline = () => {
      void syncPendingWorkspaceChanges();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return children;
}
