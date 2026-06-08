import axiosClient from '@/config/client';

export type DeveloperAppRecord = {
  appId: string;
  name: string;
  developerPiUid: string;
  contactEmail: string | null;
  status: string;
  allowedOrigins: string[];
  lastUsedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export const fetchDeveloperApps = async (piAccessToken: string): Promise<DeveloperAppRecord[]> => {
  const { data } = await axiosClient.get('/developer/apps', {
    headers: {
      Authorization: `Bearer ${piAccessToken}`,
    },
  });
  return (data.apps ?? []) as DeveloperAppRecord[];
};
