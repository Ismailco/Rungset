export type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface WorkspaceCounts {
  checkIns: number;
  goals: number;
  milestones: number;
  notes: number;
  todos: number;
}

export interface SettingsUser {
  email?: string | null;
  id?: string | null;
  image?: string | null;
  name?: string | null;
}

export interface SettingsAlert {
  show: boolean;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isConfirmation?: boolean;
  onConfirm?: () => void;
}
