"use client";

import { DeveloperRequestRecord, DeveloperRequestStatus } from '@/services/developerRequests';

export const REQUEST_TITLES: Record<DeveloperRequestRecord['requestType'], string> = {
  create_app: 'New developer app request',
  update_app: 'Update existing app request',
  rotate_api_key: 'API key rotation request',
};

export const REQUEST_STATUS_STYLES: Record<DeveloperRequestStatus, { label: string; className: string }> = {
  requested: { label: 'Requested', className: 'bg-amber-100 text-amber-800' },
  in_progress: { label: 'In progress', className: 'bg-blue-100 text-blue-800' },
  approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rejected', className: 'bg-rose-100 text-rose-800' },
};

export type RequestActionTarget = Exclude<DeveloperRequestStatus, 'requested'>;

export const REQUEST_STATUS_ACTIONS: Record<DeveloperRequestStatus, RequestActionTarget[]> = {
  requested: ['in_progress', 'approved', 'rejected'],
  in_progress: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export const REQUEST_ACTION_CONFIG: Record<RequestActionTarget, { label: string; className: string }> = {
  in_progress: {
    label: 'Mark in progress',
    className: 'border border-indigo-200 text-indigo-700',
  },
  approved: {
    label: 'Approve',
    className: 'border border-emerald-200 text-emerald-700',
  },
  rejected: {
    label: 'Reject',
    className: 'border border-rose-200 text-rose-700',
  },
};

export const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleString();
};

export const formatFieldLabel = (key: string) =>
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const formatFieldValue = (value: unknown): string => {
  if (value == null) {
    return '—';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[object]';
    }
  }
  return String(value);
};

export const summarizeRequest = (request: DeveloperRequestRecord) => {
  const base = REQUEST_TITLES[request.requestType] ?? 'Developer request';
  const appId = typeof request.developerAppId === 'string' ? request.developerAppId.trim() : '';
  return appId ? `${base} (App ID: ${appId})` : base;
};

export const recordTimestamp = (record: DeveloperRequestRecord) => {
  const candidates = [record.updatedAt, record.createdAt] as Array<string | null>;
  for (const value of candidates) {
    if (!value) continue;
    const ts = new Date(value).getTime();
    if (!Number.isNaN(ts)) {
      return ts;
    }
  }
  return 0;
};
