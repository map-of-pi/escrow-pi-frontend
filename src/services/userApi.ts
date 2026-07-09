import axiosClient from '@/config/client';
import { IUserLookup } from '@/types';

export const lookupUserByUsername = async (username: string): Promise<IUserLookup> => {
  const normalized = username?.trim().replace(/^@+/, '').replace(/^@/, '');
  if (!normalized) {
    throw new Error('Username is required');
  }
  const { data } = await axiosClient.get(`/users/lookup/${encodeURIComponent(normalized)}`);
  return data as IUserLookup;
};
