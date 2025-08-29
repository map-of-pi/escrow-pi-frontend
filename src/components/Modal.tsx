"use client";
import React from 'react';

type ModalProps = {
  open: boolean;
  title: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm?: () => void;
  confirmText?: string;
};

export default function Modal({ open, title, children, onClose, onConfirm, confirmText = "Confirm" }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="relative bg-white w-full max-w-md rounded-3xl shadow-lg border border-gray-200 p-5">
        {/* Close (X) */}
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 text-gray-600 hover:text-gray-800 text-2xl leading-none"
        >
          ×
        </button>

        {/* Title */}
        <div className="mt-1 mb-4 text-center">
          {typeof title === 'string' ? (
            <h3 className="text-xl font-semibold leading-snug">{title}</h3>
          ) : (
            title
          )}
        </div>

        {/* Content */}
        <div className="mb-2">
          {children}
        </div>

        {/* Confirm Button */}
        {onConfirm && (
          <div className="mt-3">
            <button
              onClick={onConfirm}
              className="w-full py-3 rounded-xl font-semibold"
              style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
            >
              {confirmText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
