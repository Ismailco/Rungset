import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import AdminDashboard from '@/components/admin/AdminDashboard';
import { getAdminAccess } from '@/lib/admin/access';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const { isAdmin, session } = await getAdminAccess(await headers());
  if (!isAdmin || !session) notFound();

  return <AdminDashboard adminName={session.user.name || session.user.email} />;
}
