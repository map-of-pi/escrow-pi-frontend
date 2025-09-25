"use client";

import React from 'react';
import { NotificationType } from '@/types';

type Props = {
  notification: NotificationType;
  onToggleClear: (id: string) => void;
};

export default function NotificationCard({ notification, onToggleClear }: Props) {
  const dt = new Date(notification.createdAt);
  const formatted = dt.toLocaleString();

  return (
    <div className={`border rounded-md p-3 mb-3 ${notification.is_cleared ? 'bg-yellow-100' : ''}`}>
      <div className="text-sm text-gray-700 mb-2">{formatted}</div>
      <div className="text-base mb-3">{notification.reason}</div>
      <button
        className="px-3 py-2 text-sm rounded-md"
        style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
        onClick={() => onToggleClear(notification._id)}
      >
        {notification.is_cleared ? 'Mark as Unread' : 'Mark as Read'}
      </button>
    </div>
  );
}
