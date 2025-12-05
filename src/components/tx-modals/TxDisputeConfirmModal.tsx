"use client";

import React from "react";
import Modal from "@/components/Modal";
import ConfirmButton from "@/components/ConfirmButton";
import { TxItem, TxStatus } from "@/lib";

interface TxDisputeConfirmModalProps {
  tx: TxItem;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function TxDisputeConfirmModal({
  tx,
  open,
  onClose,
  onConfirm,
}: TxDisputeConfirmModalProps) {
  const eligible =
    (tx.myRole === "payee" && tx.status === "fulfilled") ||
    (tx.myRole === "payer" && (tx.status === "paid" || tx.status === "fulfilled"));

  if (!eligible) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<div className="font-semibold text-center">Confirm you dispute the transaction</div>}
    >
      <div className="space-y-2 text-sm">
        <div className="text-center text-gray-700">
          This will mark transaction status as disputed.
        </div>
        <div className="pt-2">
          <ConfirmButton
            className="w-full py-2 rounded-lg text-sm font-semibold"
            style={{
              background: "var(--default-primary-color)",
              color: "var(--default-secondary-color)",
            }}
            onClick={onConfirm}
          >
            Confirm
          </ConfirmButton>
        </div>
      </div>
    </Modal>
  );
}
