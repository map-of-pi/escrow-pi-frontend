"use client";

import React from "react";
import { TxItem, statusClasses, statusLabel } from "@/lib";

interface TxHeaderCardProps {
  tx: TxItem;
  arrowLabel: string;
  isRefreshing: boolean;
  onBack: () => void;
  onRefresh: () => void;
}

export default function TxHeaderCard({
  tx,
  arrowLabel,
  isRefreshing,
  onBack,
  onRefresh,
}: TxHeaderCardProps) {
  return (
    <div className="relative flex items-center gap-2">
      <button
        aria-label="Go back"
        className="inline-flex items-center justify-center h-9 w-9 rounded-full border hover:bg-gray-50"
        onClick={onBack}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <h1
        className="absolute left-1/2 -translate-x-1/2 text-lg font-bold text-center"
        style={{ color: "var(--default-primary-color)" }}
      >
        EscrowPi Transaction
      </h1>
      <button
        aria-label="Refresh"
        className={`absolute right-0 inline-flex items-center justify-center h-9 w-9 rounded-full border ${isRefreshing ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}
        onClick={onRefresh}
        disabled={isRefreshing}
        title="Refresh"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isRefreshing ? "animate-spin" : ""}
        >
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10"></path>
          <path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14"></path>
        </svg>
      </button>
    </div>
  );
}
