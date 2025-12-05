"use client";

import React from "react";
import { TxItem, fmt, deriveBreakdown } from "@/lib";

interface TxDetailsBreakdownProps {
  tx: TxItem;
}

export default function TxDetailsBreakdown({ tx }: TxDetailsBreakdownProps) {
  const b = deriveBreakdown(tx.amount);
  const refundNote =
    tx.myRole === "payer" ? "(refunded to you at end)" : "(refunded to the payer at end)";
  const getLabel = tx.myRole === "payee" ? "You get:" : "Payee gets:";

  return (
    <details className="group">
      <summary className="cursor-pointer select-none font-semibold inline-flex items-center gap-2 mt-2">
        <span>EscrowPi Transaction Details</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="transition-transform duration-200 group-open:rotate-90"
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </summary>
      <div className="mt-3 md:mt-2 text-sm">
        <div className="space-y-2 rounded-lg border border-black p-3">
          <div className="flex justify-between">
            <span>{getLabel}</span>
            <span>{fmt(b.base)} pi</span>
          </div>
          <div className="flex justify-between">
            <span>Transaction completion stake:</span>
            <span>{fmt(b.completionStake)} pi</span>
          </div>
          <div className="text-[11px] text-gray-600">{refundNote}</div>
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
      </div>
    </details>
  );
}
