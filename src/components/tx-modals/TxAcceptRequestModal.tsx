"use client";

import React from "react";
import Modal from "@/components/Modal";
import { TxItem, fmt, deriveBreakdown } from "@/lib";

interface TxAcceptRequestModalProps {
  tx: TxItem;
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function TxAcceptRequestModal({
  tx,
  open,
  onClose,
  onConfirm,
}: TxAcceptRequestModalProps) {
  if (!(tx.myRole === "payer" && tx.status === "requested")) return null;

  const b = deriveBreakdown(tx.amount);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="text-center space-y-1">
          <div className="font-semibold">
            Confirm you accept the request to pay pi
          </div>
          <div className="text-2xl font-bold">{fmt(b.total)} pi</div>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>They get:</span>
          <span>{fmt(b.base)} pi</span>
        </div>
        <div className="flex justify-between">
          <span>Transaction completion stake:</span>
          <span>{fmt(b.completionStake)} pi</span>
        </div>
        <div className="text-[11px] text-gray-600">(refunded to you at end)</div>
        <div className="flex justify-between">
          <span>Pi Network gas fees:</span>
          <span>{fmt(b.networkFees)} pi</span>
        </div>
        <div className="flex justify-between">
          <span>EscrowPi fee:</span>
          <span>{fmt(b.escrowFee)} pi</span>
        </div>
        <div className="pt-2">
          <button
            className="w-full py-2 rounded-lg text-sm font-semibold"
            style={{
              background: "var(--default-primary-color)",
              color: "var(--default-secondary-color)",
            }}
            onClick={async () => {
              await onConfirm();
            }}
          >
            Confirm Accept
          </button>
        </div>
      </div>
    </Modal>
  );
}
