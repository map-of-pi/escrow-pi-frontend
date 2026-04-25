import axiosClient from '@/config/client';

export type DeveloperRequestType = 'create_app' | 'update_app' | 'rotate_api_key';
export type DeveloperRequestStatus = 'requested' | 'in_progress' | 'closed';

export type DeveloperRequestRecord = {
  id: string | null;
  requestType: DeveloperRequestType;
  developerAppId: string | null;
  status: DeveloperRequestStatus;
  formData: Record<string, any>;
  adminNotes: string | null;
  handledBy: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  piUsername?: string | null;
  piUid?: string | null;
};

export type DeveloperRequestCreatePayload = {
  requestType: DeveloperRequestType;
  developerAppId?: string;
  formData: Record<string, any>;
};

export const submitDeveloperRequest = async (
  payload: DeveloperRequestCreatePayload,
  piAccessToken: string
): Promise<DeveloperRequestRecord> => {
  const { data } = await axiosClient.post(
    '/developer/requests',
    payload,
    {
      headers: {
        Authorization: `Bearer ${piAccessToken}`,
      },
    }
  );
  return data.request as DeveloperRequestRecord;
};

export const fetchDeveloperRequests = async (
  params: { status?: DeveloperRequestStatus; requestType?: DeveloperRequestType; limit?: number } = {},
  piAccessToken: string
): Promise<DeveloperRequestRecord[]> => {
  const { data } = await axiosClient.get('/developer/requests', {
    params,
    headers: {
      Authorization: `Bearer ${piAccessToken}`,
    },
  });
  return (data.requests ?? []) as DeveloperRequestRecord[];
};
