'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface NotificationContextType {
  showNotification: (options: NotificationOptions) => void;
  requestPermission: () => Promise<NotificationPermission>;
  hasPermission: boolean;
}

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
  silent?: boolean;
  onClick?: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    // Check if the browser supports notifications
    if (!('Notification' in window)) {
      return;
    }

    // Check if we already have permission
    if (Notification.permission === 'granted') {
      setHasPermission(true);
    }
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      return 'denied' as NotificationPermission;
    }

    try {
      const permission = await Notification.requestPermission();
      setHasPermission(permission === 'granted');
      return permission;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied' as NotificationPermission;
    }
  };

  const showNotification = async ({
    title,
    body,
    icon = '/favicon-128x128.png',
    tag,
    data,
    requireInteraction = false,
    silent = false,
    onClick
  }: NotificationOptions) => {
    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission !== 'granted') {
      const permission = await requestPermission();
      if (permission !== 'granted') {
        return;
      }
    }

    try {
      const notification = new Notification(title, {
        body,
        icon,
        tag,
        data,
        requireInteraction,
        silent,
      });

      if (onClick) {
        notification.onclick = () => {
          onClick();
          notification.close();
        };
      }
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  };

  return (
    <NotificationContext.Provider value={{ showNotification, requestPermission, hasPermission }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
