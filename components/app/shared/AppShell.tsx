'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Navbar from '@/components/app/shared/Navbar';
import Sidebar from '@/components/app/shared/Sidebar';
import { isPublicPath } from '@/components/app/shared/navigation';
import { useSession } from '@/lib/auth/auth-client';

export default function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isPublicRoute = isPublicPath(pathname);
  const { data: session, isPending } = useSession();
  const [logoutRequested, setLogoutRequested] = useState(false);

  useEffect(() => {
    if (isPublicRoute) {
      return;
    }

    if (sessionStorage.getItem('goalgenius-logged-out') === 'true') {
      setLogoutRequested(true);
      window.location.replace(
        `/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`,
      );
      return;
    }
  }, [isPublicRoute, pathname]);

  useEffect(() => {
    if (isPublicRoute || isPending || session || logoutRequested) return;

    window.location.replace(
      `/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`,
    );
  }, [isPending, isPublicRoute, logoutRequested, pathname, session]);

  if (!isPublicRoute && (isPending || !session || logoutRequested)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] p-6">
        <div className="text-sm text-[var(--text-secondary)]" role="status">
          Checking your session…
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell flex min-h-screen">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {!isPublicRoute && <Sidebar />}
      <main
        id="main-content"
        tabIndex={-1}
        className={`shell-main ${
          isPublicRoute
            ? ''
            : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pb-8 lg:pt-8'
        }`}
      >
        {children}
      </main>
      {!isPublicRoute && <Navbar />}
    </div>
  );
}
