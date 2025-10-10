import axiosClient from '@/config/client';
import { INotification, NotificationType } from '@/types';

let MOCK_CACHE: NotificationType[] | null = null;

const isMockEnabled = () => process.env.NEXT_PUBLIC_USE_MOCK_NOTIFICATIONS === 'true';

async function loadMock(): Promise<NotificationType[]> {
  if (MOCK_CACHE) return MOCK_CACHE;
  const data = await import('@/data/notifications.json');
  // Next.js JSON import default typing
  MOCK_CACHE = (data.default ?? data) as NotificationType[];
  // Sort newest first to mimic backend behavior
  MOCK_CACHE.sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
  return MOCK_CACHE;
}

export const getNotifications = async (
  { pi_uid, skip, limit, status }:
  { pi_uid: string, skip: number, limit: number, status?: 'cleared' | 'uncleared' }
) => {
  if (isMockEnabled()) {
    const all = await loadMock();
    let filtered = all.filter(n => n.pi_uid === pi_uid);
    if (status === 'cleared') filtered = filtered.filter(n => n.is_cleared === true);
    if (status === 'uncleared') filtered = filtered.filter(n => n.is_cleared === false);
    // limit=0 in our usage means "no limit" (used by indicator check)
    const slice = limit && limit > 0 ? filtered.slice(skip, skip + limit) : filtered.slice(skip);
    return slice;
  }

  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });
  if (status) params.append('status', status);

  const res = await axiosClient.get(`/notifications/?${params.toString()}`);
  if (res.status !== 200) throw new Error('Failed to fetch notifications');
  return res.data;
};

export const buildNotification = async (data: INotification) => {
  if (isMockEnabled()) {
    // Simulate creating a new notification for demo purposes
    const all = await loadMock();
    const now = new Date().toISOString();
    const newItem: NotificationType = {
      _id: `mock-${Math.random().toString(36).slice(2)}`,
      pi_uid: 'SAMPLE_PI_UID',
      is_cleared: false,
      reason: data.reason,
      createdAt: now,
      updatedAt: now,
    };
    MOCK_CACHE = [newItem, ...all];
    return { message: 'Mock notification created', notification: newItem };
  }

  const res = await axiosClient.post(`/notifications`, data);
  if (res.status !== 200) throw new Error('Failed to create notification');
  return res.data;
};

export const updateNotification = async (notification_id: string) => {
  if (isMockEnabled()) {
    const all = await loadMock();
    const idx = all.findIndex(n => n._id === notification_id);
    if (idx !== -1) {
      const updated = { ...all[idx], is_cleared: !all[idx].is_cleared, updatedAt: new Date().toISOString() };
      all[idx] = updated;
      MOCK_CACHE = [...all];
      return { message: 'Mock notification updated', updatedNotification: updated };
    }
    throw new Error('Mock notification not found');
  }

  const res = await axiosClient.put(`/notifications/update/${notification_id}`);
  if (res.status !== 200) throw new Error('Failed to update notification');
  return res.data;
};
