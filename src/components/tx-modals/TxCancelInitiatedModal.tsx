"use client";

import React from "react";
import Modal from "@/components/Modal";
import { TxItem } from "@/lib";

interface TxCancelInitiatedModalProps {
  tx: TxItem;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function TxCancelInitiatedModal({
  tx,
  open,
  onClose,
  onConfirm,
}: TxCancelInitiatedModalProps) {
  if (tx.status !== "initiated") return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="font-semibold text-center">
          Confirm you wish to cancel the initiated transaction
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <div className="text-center text-gray-700">
          This will cancel the initiated transaction.
        </div>
        <div className="pt-2">
          <button
            className="w-full py-2 rounded-lg text-sm font-semibold"
            style={{
              background: "var(--default-primary-color)",
              color: "var(--default-secondary-color)",
            }}
            onClick={onConfirm}
          >
            Confirm Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
