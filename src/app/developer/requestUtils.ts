import { DeveloperRequestRecord, DeveloperRequestStatus } from '@/services/developerRequests';

export const statusStyles: Record<DeveloperRequestStatus, { label: string; className: string }> = {
  requested: { label: 'Requested', className: 'bg-amber-100 text-amber-800' },
  in_progress: { label: 'In progress', className: 'bg-blue-100 text-blue-800' },
  approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rejected', className: 'bg-rose-100 text-rose-800' },
};

export const ACTIVE_REQUEST_STATUSES: DeveloperRequestStatus[] = ['requested', 'in_progress'];

export const isActiveRequestStatus = (status: DeveloperRequestStatus) =>
  ACTIVE_REQUEST_STATUSES.includes(status);

export const summarizeRequest = (request: DeveloperRequestRecord) => {
  const formData = request.formData || {};
  if (request.requestType === 'create_app') {
    return formData.appName ? `New app: ${formData.appName}` : 'New app onboarding';
  }
  if (request.requestType === 'update_app') {
    if (formData.appName) return `Update ${formData.appName}`;
    if (Array.isArray(formData.allowedOrigins) && formData.allowedOrigins.length) {
      return `Update allowed origins (${formData.allowedOrigins.length})`;
    }
    return 'Update developer app metadata';
  }
  if (request.requestType === 'rotate_api_key') {
    return formData.reason ? `Rotate key (${formData.reason})` : 'Rotate API key';
  }
  return 'Developer request';
};

export const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export const formatRequestFieldLabel = (key: string) =>
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const formatRequestFieldValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (Array.isArray(value)) {
    return value.join('\n');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
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
