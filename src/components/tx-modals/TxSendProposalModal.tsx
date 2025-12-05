"use client";

import React from "react";
import Modal from "@/components/Modal";
import { TxItem, fmt, deriveBreakdown } from "@/lib";

interface TxSendProposalModalProps {
  tx: TxItem;
  open: boolean;
  onClose: () => void;
  refundPercent: number;
  refundPercentStr: string;
  onConfirm: () => Promise<void>;
}

export default function TxSendProposalModal({
  tx,
  open,
  onClose,
  refundPercent,
  refundPercentStr,
  onConfirm,
}: TxSendProposalModalProps) {
  if (tx.status !== "disputed") return null;

  const b = deriveBreakdown(tx.amount);
  const refund = (b.base * refundPercent) / 100;
  const payeeGets = b.base - refund;
  const showNetworkRefund = Math.abs(refundPercent - 100) < 1e-9;
  const totalRefunded = refund + b.completionStake + (showNetworkRefund ? 0.01 : 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="font-semibold text-center">
          You propose dispute resolution refund {refundPercent}%
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Payer gets refund:</span>
          <span>{fmt(refund)} pi</span>
        </div>
        <div className="flex justify-between">
          <span>Payee gets:</span>
          <span>{fmt(payeeGets)} pi</span>
        </div>
        <div className="flex justify-between">
          <span>Stake refunded to Payer:</span>
          <span>{fmt(b.completionStake)} pi</span>
        </div>
        {showNetworkRefund && (
          <div className="flex justify-between">
            <span>Pi Network gas fees (refunded to payer):</span>
            <span>{fmt(0.01)} pi</span>
          </div>
        )}
        <div className="flex justify-between font-semibold border-t pt-2">
          <span>Total refunded:</span>
          <span>{fmt(totalRefunded)} pi</span>
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
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  );
}
