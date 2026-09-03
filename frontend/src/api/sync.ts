import { api } from './client';

export interface SyncResult {
  entriesFound:   number;
  entriesSynced:  number;
  entriesSkipped: number;
  errors:         string[];
  syncedAt:       string;
}

export interface SyncStatus {
  synced: boolean;
  message?: string;
  synced_at?: string;
  entries_found?: number;
  entries_synced?: number;
  entries_skipped?: number;
  errors?: string;
}

export const syncApi = {
  triggerSync:   () => api.post<SyncResult>('/api/sync/cognito').then(r => r.data),
  getStatus:     () => api.get<SyncStatus>('/api/sync/cognito/status').then(r => r.data),
};