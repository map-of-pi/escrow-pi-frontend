"use client";

import React, { useContext, useEffect, useRef, useState } from 'react';
import { AppContext } from '@/context/AppContextProvider';
import { NotificationType } from '@/types';
import { getNotifications, updateNotification } from '@/services/notificationApi';
import NotificationCard from '@/components/NotificationCard';

export default function NotificationsPage() {
  const { currentUser } = useContext(AppContext);
  const [items, setItems] = useState<NotificationType[]>([]);
  // We derive skips from the current merged list to avoid duplicate/skip issues
  const [limit] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMoreUnread, setHasMoreUnread] = useState(true);
  const [hasMoreRead, setHasMoreRead] = useState(true);
  const [phase, setPhase] = useState<'unread' | 'read'>('unread');
  const [totalUnread, setTotalUnread] = useState<number | null>(null);
  const [fetchedUnread, setFetchedUnread] = useState(0);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const fetchingRef = useRef(false);

  const fetchMore = async () => {
    if (!currentUser?.pi_uid) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (isLoading) { fetchingRef.current = false; return; }
    if (phase === 'unread' && !hasMoreUnread) {
      // Switch to read phase if unread exhausted
      setPhase('read');
      if (!hasMoreRead) return;
    } else if (phase === 'read' && !hasMoreRead) {
      fetchingRef.current = false; return;
    }
    setIsLoading(true);
    try {
      // Compute skips from current items to avoid duplicate/skip races
      const unreadSoFar = items.filter(n => !n.is_cleared).length;
      const readSoFar = items.filter(n => n.is_cleared).length;
      const args = phase === 'unread'
        ? { pi_uid: currentUser.pi_uid, skip: unreadSoFar, limit, status: 'uncleared' as const }
        : { pi_uid: currentUser.pi_uid, skip: readSoFar, limit, status: 'cleared' as const };
      
      const res: NotificationType[] = await getNotifications(args);
      // Strictly filter by phase to avoid accidental mixing if backend/mocks ignore status
      const filtered = Array.isArray(res)
        ? res.filter(n => phase === 'unread' ? !n.is_cleared : n.is_cleared)
        : [];
      
      if (filtered.length > 0) {
        setItems(prev => {
          // Deduplicate by _id then sort: unread first, then read; both by createdAt desc
          const map = new Map<string, NotificationType>();
          [...prev, ...filtered].forEach(n => map.set(n._id, n));
          const arr = Array.from(map.values());
          arr.sort((a, b) => {
            const aRead = a.is_cleared ? 1 : 0;
            const bRead = b.is_cleared ? 1 : 0;
            if (aRead !== bRead) return aRead - bRead; // unread (0) first
            const ad = new Date(a.createdAt as any).getTime();
            const bd = new Date(b.createdAt as any).getTime();
            return bd - ad; // newest first
          });
          
          return arr;
        });
        if (phase === 'unread') {
          // Atomically compute next fetched unread and decide switch
          setFetchedUnread(prev => {
            const next = prev + filtered.length;
            const total = totalUnread ?? Infinity;
            if (next >= total) {
              setHasMoreUnread(false);
              setPhase('read');
            }
            return next;
          });
        } else {
          if (filtered.length < limit) setHasMoreRead(false);
        }
        // Signal possible change in unread count
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('escrowpi:notifications-updated'));
        }
      } else {
        if (phase === 'read') {
          setHasMoreRead(false);
        } else {
          // Do not prematurely switch; rely on totalUnread threshold
          // If we got an empty page but totalUnread not reached, we'll try again on next intersection.
        }
      }
    } catch (e) {
      console.error('Failed to load notifications', e);
    } finally {
      
      setIsLoading(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    // reset on user change
    setItems([]);
    setHasMoreUnread(true);
    setHasMoreRead(true);
    setPhase('unread');
    setTotalUnread(null);
    setFetchedUnread(0);
  }, [currentUser?.pi_uid]);

  // Prefetch total unread to control phase switching precisely
  useEffect(() => {
    const loadTotalUnread = async () => {
      if (!currentUser?.pi_uid) return;
      try {
        const allUnread = await getNotifications({ pi_uid: currentUser.pi_uid, skip: 0, limit: 0, status: 'uncleared' });
        setTotalUnread(Array.isArray(allUnread) ? allUnread.length : 0);
      } catch {
        setTotalUnread(null);
      }
    };
    loadTotalUnread();
  }, [currentUser?.pi_uid]);

  useEffect(() => {
    if (currentUser?.pi_uid) fetchMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.pi_uid, totalUnread]);

  // Set up infinite scroll observer using the scrollable list container as root
  useEffect(() => {
    const rootEl = listRef.current;
    const sentinel = loadMoreRef.current;
    if (!rootEl || !sentinel) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && !isLoading) {
        fetchMore();
      }
    }, { root: rootEl, rootMargin: '200px', threshold: 0.1 });

    observerRef.current.observe(sentinel);
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [isLoading, items.length, phase, hasMoreUnread, hasMoreRead]);

  // Auto-fill: if list doesn't overflow its container and there is more to load, fetch more
  useEffect(() => {
    const rootEl = listRef.current;
    if (!rootEl || isLoading) return;
    const canLoadMore = phase === 'unread' ? hasMoreUnread : hasMoreRead;
    if (!canLoadMore) return;
    const needsMore = rootEl.scrollHeight <= rootEl.clientHeight + 8; // small buffer
    if (needsMore) {
      fetchMore();
    }
    // We intentionally depend on items.length to re-check after each page
  }, [items.length, phase, hasMoreUnread, hasMoreRead, isLoading]);

  const onToggleClear = async (id: string) => {
    const prev = items.find(n => n._id === id);
    if (!prev) return;
    setItems(list => {
      const updated = list.map(n => n._id === id ? { ...n, is_cleared: !n.is_cleared } : n);
      updated.sort((a, b) => {
        const aRead = a.is_cleared ? 1 : 0;
        const bRead = b.is_cleared ? 1 : 0;
        if (aRead !== bRead) return aRead - bRead;
        const ad = new Date(a.createdAt as any).getTime();
        const bd = new Date(b.createdAt as any).getTime();
        return bd - ad;
      });
      return updated;
    });
    try {
      await updateNotification(id);
      // Inform listeners (Navbar) to refresh unread indicator
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('escrowpi:notifications-updated'));
      }
    } catch (e) {
      console.error('Failed to toggle notification', e);
      // rollback
      setItems(list => {
        const rolled = list.map(n => n._id === id ? { ...n, is_cleared: prev.is_cleared } : n);
        rolled.sort((a, b) => {
          const aRead = a.is_cleared ? 1 : 0;
          const bRead = b.is_cleared ? 1 : 0;
          if (aRead !== bRead) return aRead - bRead;
          const ad = new Date(a.createdAt as any).getTime();
          const bd = new Date(b.createdAt as any).getTime();
          return bd - ad;
        });
        return rolled;
      });
    }
  };

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold text-center mb-4">Notifications</h1>
      {items.length === 0 && !isLoading && (
        <div className="text-center text-sm text-gray-600">No notifications</div>
      )}
      {/* Scrollable list container */}
      <div ref={listRef} className="max-h-[80vh] overflow-y-auto pr-1">
        {items.map(n => (
          <NotificationCard key={n._id} notification={n} onToggleClear={onToggleClear} />
        ))}
        {/* Sentinel element for IntersectionObserver to load more when visible */}
        {(phase === 'unread' ? hasMoreUnread : hasMoreRead) && (
          <div ref={loadMoreRef} className="h-px" />
        )}
      </div>
    </div>
  );
}
