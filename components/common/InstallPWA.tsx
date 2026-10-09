'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export const InstallPWA = () => {
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later
			deferredPrompt = e as BeforeInstallPromptEvent;
      // Show the install button
      setIsInstallable(true);
    });

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      // Hide the install button
      setIsInstallable(false);
      // Clear the deferredPrompt
      deferredPrompt = null;
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    await deferredPrompt.userChoice;
    // Clear the deferredPrompt variable
    deferredPrompt = null;
    // Hide the install button
    setIsInstallable(false);
  };

  if (!isInstallable) return null;

  return (
    <button
      type="button"
      aria-label="Install App"
      onClick={handleInstallClick}
      className="flex items-center gap-2"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Install App
    </button>
  );
};
