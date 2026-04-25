import axiosClient from '@/config/client';
import {
  DeveloperRequestRecord,
  DeveloperRequestStatus,
  DeveloperRequestType,
} from '@/services/developerRequests';
import { DeveloperAppRecord } from '@/services/developerApps';

export type AdminUserRecord = {
  piUid: string;
  piUsername: string;
  userName: string;
  isAdmin: boolean;
};

export const fetchAdminUsers = async (piAccessToken: string): Promise<AdminUserRecord[]> => {
  const { data } = await axiosClient.get('/admin/admins', {
    headers: {
      Authorization: `Bearer ${piAccessToken}`,
    },
  });
  return data.admins ?? [];
};

export const promoteAdminUser = async (
  payload: { piUid?: string; piUsername?: string },
  piAccessToken: string
): Promise<AdminUserRecord> => {
  const { data } = await axiosClient.post('/admin/admins', payload, {
    headers: {
      Authorization: `Bearer ${piAccessToken}`,
    },
  });
  return data.admin;
};

export const removeAdminUser = async (piUid: string, piAccessToken: string): Promise<AdminUserRecord> => {
  const { data } = await axiosClient.delete(`/admin/admins/${piUid}`, {
    headers: {
      Authorization: `Bearer ${piAccessToken}`,
    },
  });
  return data.admin;
};

type AdminDeveloperRequestFilters = {
  status?: DeveloperRequestStatus;
  requestType?: DeveloperRequestType;
  limit?: number;
};

export const fetchAdminDeveloperRequests = async (
  params: AdminDeveloperRequestFilters = {},
  piAccessToken: string
): Promise<DeveloperRequestRecord[]> => {
  const { data } = await axiosClient.get('/admin/developer-requests', {
    params,
    headers: {
      Authorization: `Bearer ${piAccessToken}`,
    },
  });
  return (data.requests ?? []) as DeveloperRequestRecord[];
};

export const updateAdminDeveloperRequest = async (
  requestId: string,
  payload: { status?: DeveloperRequestStatus; adminNotes?: string | null },
  piAccessToken: string
): Promise<DeveloperRequestRecord> => {
  const { data } = await axiosClient.patch(`/admin/developer-requests/${requestId}`, payload, {
    headers: {
      Authorization: `Bearer ${piAccessToken}`,
    },
  });
  return data.request as DeveloperRequestRecord;
};

export const fetchAdminDeveloperApps = async (piAccessToken: string): Promise<DeveloperAppRecord[]> => {
  const { data } = await axiosClient.get('/admin/developer-apps', {
    headers: {
      Authorization: `Bearer ${piAccessToken}`,
    },
  });
  return (data.apps ?? []) as DeveloperAppRecord[];
};
