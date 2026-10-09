import type { WorkspaceExport } from './types';
import { apiRequest } from './api';

export async function getWorkspaceExport(): Promise<WorkspaceExport> {
  return apiRequest<WorkspaceExport>('export', 'GET');
}
