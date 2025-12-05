"use client";

import React from "react";
import Modal from "@/components/Modal";
import { TxItem, fmt, deriveBreakdown } from "@/lib";

interface TxCancelPaidModalProps {
  tx: TxItem;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function TxCancelPaidModal({
  tx,
  open,
  onClose,
  onConfirm,
}: TxCancelPaidModalProps) {
  if (!(tx.myRole === "payer" && tx.status === "paid")) return null;

  const b = deriveBreakdown(tx.amount);
  const networkRefund = 0.01;
  const refundTotal = b.base + b.completionStake + networkRefund;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        (() => {
          return (
            <div className="text-center space-y-1">
              <div className="font-semibold">
                Confirm cancel transaction and get refund
              </div>
              <div className="text-2xl font-bold">{fmt(refundTotal)} pi</div>
            </div>
          );
        })()
      }
    >
      <div className="space-y-3 text-sm">
        {(() => {
          const networkNotRefunded = 0.01;
          const innerRefundTotal = b.base + b.completionStake + networkRefund;
          return (
            <div className="space-y-2 rounded-lg p-3">
              <div className="flex justify-between">
                <span>Payer amount (refunded):</span>
                <span>{fmt(b.base)} pi</span>
              </div>
              <div className="flex justify-between">
                <span>Transaction Stake (refunded):</span>
                <span>{fmt(b.completionStake)} pi</span>
              </div>
              <div className="flex justify-between">
                <span>Pi Network gas fees (refunded):</span>
                <span>{fmt(networkRefund)} pi</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Total refunded:</span>
                <span>{fmt(innerRefundTotal)} pi</span>
              </div>
            </div>
          );
        })()}
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
