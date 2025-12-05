"use client";

import React from "react";
import Modal from "@/components/Modal";
import { TxItem } from "@/lib";

interface TxFulfilledModalProps {
  tx: TxItem;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function TxFulfilledModal({ tx, open, onClose, onConfirm }: TxFulfilledModalProps) {
  if (!(tx.myRole === "payee" && tx.status === "paid")) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="font-semibold text-center">
          Confirm you have fulfilled the purchase
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <div className="text-center text-gray-700">
          This will mark transaction status as fulfilled.
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
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  );
}
