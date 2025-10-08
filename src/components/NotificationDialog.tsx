"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { IoMdClose } from 'react-icons/io';

type Props = {
  setShowDialog: (v: boolean) => void;
  onClose?: () => void;
  message: string;
  url: string;
};

export default function NotificationDialog({ setShowDialog, onClose, message, url }: Props) {
  const router = useRouter();

  const handleClicked = () => {
    try { onClose?.(); } catch {}
    router.push(url);
    setShowDialog(false);
  };

  const handleClose = () => {
    try { onClose?.(); } catch {}
    setShowDialog(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-6 sm:mx-auto relative shadow-lg border-2 border-gray-300">
        <button
          onClick={handleClose}
          className="absolute top-3 right-3"
          aria-label="Close"
        >
          <IoMdClose size={24} className="text-gray-600 hover:text-gray-800" />
        </button>
        <div className="text-center mt-5">
          <p className="text-2xl mb-6">{message}</p>
          <div className="flex justify-center space-x-4">
            <button
              onClick={handleClicked}
              className="px-4 py-2 rounded-md text-xl"
              style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
            >
              View Notifications
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
