"use client";
import React from 'react';

type ModalProps = {
  open: boolean;
  title: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  fullScreen?: boolean;
  confirmLoading?: boolean
};

export default function Modal({ open, title, children, onClose, onConfirm, confirmLoading, confirmText = "Confirm", fullScreen = false }: ModalProps) {
  if (!open) return null;
  return (
    <div className={fullScreen ? "fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-0" : "fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center"}>
      <div
        className={fullScreen
          ? "relative bg-white w-full max-w-none rounded-none shadow-lg border border-gray-200 p-0 overflow-auto"
          : "relative bg-white w-full max-w-md rounded-3xl shadow-lg border border-gray-200 p-0 m-3 overflow-auto"}
        style={fullScreen ? { marginTop: '76.19px', height: 'calc(100dvh - 76.19px)' } : undefined}
      >
        {/* Sticky Header: Title + Close */}
        <div className="sticky top-0 z-10 bg-white border-b px-5 py-3 sm:px-6 sm:py-4">
          <div className="relative">
            <div className="text-center">
              {typeof title === 'string' ? (
                <h3 className="text-xl font-semibold leading-snug">{title}</h3>
              ) : (
                title
              )}
            </div>
            <button
              aria-label="Close"
              onClick={onClose}
              className="absolute right-0 top-1 text-gray-600 hover:text-gray-800 text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="px-5 py-4 sm:px-6 sm:py-5">
          {children}
        </div>

        {/* Confirm Button */}
        {onConfirm && (
          <div className="mt-3">
            <button
              onClick={onConfirm}
              className={`w-full py-3 rounded-xl font-semibold ${confirmLoading ? 'bg-[var(--default-tertiary-color)]': 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]'}`}
              disabled={confirmLoading ? confirmLoading : false}
            >
              {confirmText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
