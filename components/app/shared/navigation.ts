import type { LucideIcon } from 'lucide-react';
import {
  CircleCheckBig,
  ListTodo,
  NotebookPen,
  Settings,
  Sun,
  Target,
} from 'lucide-react';

export interface AppNavigationItem {
  activePaths?: string[];
  href: string;
  icon: LucideIcon;
  mobilePrimary?: boolean;
  name: string;
}

export const APP_NAV_ITEMS: AppNavigationItem[] = [
  { href: '/dashboard', icon: Sun, mobilePrimary: true, name: 'Today' },
  {
    activePaths: ['/milestones'],
    href: '/goals',
    icon: Target,
    mobilePrimary: true,
    name: 'Goals',
  },
  { href: '/todos', icon: ListTodo, mobilePrimary: true, name: 'Tasks' },
  {
    href: '/checkins',
    icon: CircleCheckBig,
    mobilePrimary: true,
    name: 'Check-ins',
  },
  { href: '/notes', icon: NotebookPen, name: 'Notes' },
];

export const APP_UTILITY_NAV_ITEMS: AppNavigationItem[] = [
  { href: '/settings', icon: Settings, name: 'Settings' },
];

export const ALL_APP_NAV_ITEMS = [
  ...APP_NAV_ITEMS,
  ...APP_UTILITY_NAV_ITEMS,
];

export const MOBILE_PRIMARY_NAV_ITEMS = APP_NAV_ITEMS.filter(
  (item) => item.mobilePrimary,
);

export function isPublicPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname.startsWith('/auth/') ||
    pathname === '/email-preferences' ||
    pathname.startsWith('/email-preferences/')
  );
}

export function isNavigationItemActive(
  pathname: string,
  itemOrHref: AppNavigationItem | string,
) {
  const href = typeof itemOrHref === 'string' ? itemOrHref : itemOrHref.href;
  const activePaths =
    typeof itemOrHref === 'string' ? [] : (itemOrHref.activePaths ?? []);
  const paths = [href, ...activePaths];

  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function getActiveNavigationItem(pathname: string) {
  return ALL_APP_NAV_ITEMS.find((item) =>
    isNavigationItemActive(pathname, item),
  );
}
