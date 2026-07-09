'use client';

import { ReactNode } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 px-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {description && <div className="mt-2 text-sm text-gray-600">{description}</div>}
        <div className="mt-6 flex flex-wrap justify-end gap-3 text-sm">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-gray-200 px-4 py-2 font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
