import axiosClient from '@/config/client';
import { INotification } from '@/types';

export const getNotifications = async (
  { pi_uid, skip, limit, status }:
  { pi_uid: string, skip: number, limit: number, status?: 'cleared' | 'uncleared' }
) => {
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });
  if (status) params.append('status', status);

  const res = await axiosClient.get(`/notifications/${pi_uid}?${params.toString()}`);
  if (res.status !== 200) throw new Error('Failed to fetch notifications');
  return res.data;
};

export const buildNotification = async (data: INotification) => {
  const res = await axiosClient.post(`/notifications`, data);
  if (res.status !== 200) throw new Error('Failed to create notification');
  return res.data;
};

export const updateNotification = async (notification_id: string) => {
  const res = await axiosClient.put(`/notifications/update/${notification_id}`);
  if (res.status !== 200) throw new Error('Failed to update notification');
  return res.data;
};
