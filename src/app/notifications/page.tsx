"use client";

import React, { useContext, useEffect, useRef, useState } from 'react';
import { AppContext } from '@/context/AppContextProvider';
import { NotificationType } from '@/types';
import { getNotifications, updateNotification } from '@/services/notificationApi';
import NotificationCard from '@/components/NotificationCard';

export default function NotificationsPage() {
  const { currentUser } = useContext(AppContext);
  const [items, setItems] = useState<NotificationType[]>([]);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const fetchMore = async () => {
    if (!currentUser?.pi_uid || isLoading || !hasMore) return;
    setIsLoading(true);
    try {
      const res: NotificationType[] = await getNotifications({ pi_uid: currentUser.pi_uid, skip, limit });
      if (Array.isArray(res) && res.length > 0) {
        const merged = [...items, ...res];
        const notCleared = merged.filter(n => !n.is_cleared);
        const cleared = merged.filter(n => n.is_cleared);
        setItems([...notCleared, ...cleared]);
        setSkip(skip + limit);
        if (res.length < limit) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error('Failed to load notifications', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // reset on user change
    setItems([]);
    setSkip(0);
    setHasMore(true);
  }, [currentUser?.pi_uid]);

  useEffect(() => {
    if (currentUser?.pi_uid) fetchMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.pi_uid]);

  const onToggleClear = async (id: string) => {
    const prev = items.find(n => n._id === id);
    if (!prev) return;
    setItems(list => list.map(n => n._id === id ? { ...n, is_cleared: !n.is_cleared } : n));
    try {
      await updateNotification(id);
    } catch (e) {
      console.error('Failed to toggle notification', e);
      // rollback
      setItems(list => list.map(n => n._id === id ? { ...n, is_cleared: prev.is_cleared } : n));
    }
  };

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold text-center mb-4">Notifications</h1>
      {items.length === 0 && !isLoading && (
        <div className="text-center text-sm text-gray-600">No notifications</div>
      )}
      <div>
        {items.map(n => (
          <NotificationCard key={n._id} notification={n} onToggleClear={onToggleClear} />
        ))}
      </div>
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            disabled={isLoading}
            onClick={fetchMore}
            className="px-4 py-2 rounded-md"
            style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
          >
            {isLoading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
      <div ref={loadMoreRef} />
    </div>
  );
}
