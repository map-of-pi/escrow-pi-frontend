"use client";

import React from "react";
import Modal from "@/components/Modal";
import ConfirmButton from "@/components/ConfirmButton";
import { TxItem, statusLabel, fmt, deriveBreakdown } from "@/lib";

interface TxReceivedModalProps {
  tx: TxItem;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function TxReceivedModal({ tx, open, onClose, onConfirm }: TxReceivedModalProps) {
  if (!(tx.myRole === "payer" && tx.status === "fulfilled")) return null;

  const b = deriveBreakdown(tx.amount);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="font-semibold text-center">
          Confirm purchased item(s) received and release payment
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="text-center text-gray-700">
          This will mark transaction status as {statusLabel["released"]}.
        </div>
        <div className="space-y-2 rounded-lg border border-black p-3">
          <div className="flex justify-between">
            <span>Payee gets:</span>
            <span>{fmt(b.base)} pi</span>
          </div>
          <div className="flex justify-between">
            <span>Stake refunded to Payer:</span>
            <span>{fmt(b.completionStake)} pi</span>
          </div>
          <div className="flex justify-between">
            <span>Pi Network gas fees:</span>
            <span>{fmt(b.networkFees)} pi</span>
          </div>
          <div className="flex justify-between">
            <span>EscrowPi fee:</span>
            <span>{fmt(b.escrowFee)} pi</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total:</span>
            <span>{fmt(b.total)} pi</span>
          </div>
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
