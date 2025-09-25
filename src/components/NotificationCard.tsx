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
    <div
      className={`rounded-md p-3 mb-3 border-2 border-gray-500`}
      style={{
        // Use the same color as button text but lower intensity for cleared background.
        // color-mix provides a subtle blend if supported; falls back to a light alpha overlay.
        background: notification.is_cleared
          ? (typeof CSS !== 'undefined' && (CSS as any).supports && (CSS as any).supports('background: color-mix(in srgb, red 10%, transparent)')
            ? 'color-mix(in srgb, var(--default-secondary-color) 15%, transparent)'
            : 'rgba(255,255,255,0.12)')
          : undefined,
      }}
    >
      {/* Message at the top */}
      <div className="text-base mb-3">{notification.reason}</div>

      {/* Footer: date/time (left), action button (right) */}
      <div className="mt-2 flex items-center justify-between">
        <div className="text-xs text-gray-600">{formatted}</div>
        <button
          className="px-3 py-2 text-sm rounded-md"
          style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
          onClick={() => onToggleClear(notification._id)}
        >
          {notification.is_cleared ? 'Un-clear' : 'Clear'}
        </button>
      </div>
    </div>
  );
}
