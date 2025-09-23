"use client";
import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import transactions from '@/data/transactions.json';

// Align statuses to the spec for the history cards
// Display labels must be exactly one of: Requested, Paid, Cancelled, Declined, Disputed, Fulfilled, Completed, New
type TxStatus =
  | 'new'
  | 'requested'
  | 'paid'
  | 'cancelled'
  | 'declined'
  | 'disputed'
  | 'fulfilled'
  | 'completed';
type Direction = 'send' | 'receive';

type TxItem = {
  id: string;
  direction: Direction; // kept for potential backend mapping
  myRole: 'payer' | 'payee';
  counterparty: string;
  amount: number;
  status: TxStatus;
  date: string; // ISO
  auditLog?: string;
};

const statusClasses: Record<TxStatus, string> = {
  new: 'bg-slate-50 text-slate-700 border-slate-200',
  requested: 'bg-amber-50 text-amber-800 border-amber-200',
  paid: 'bg-blue-50 text-blue-800 border-blue-200',
  cancelled: 'bg-gray-50 text-gray-700 border-gray-200',
  declined: 'bg-gray-50 text-gray-700 border-gray-200',
  disputed: 'bg-red-50 text-red-800 border-red-200',
  fulfilled: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  completed: 'bg-green-50 text-green-800 border-green-200',
};

const statusLabel: Record<TxStatus, string> = {
  requested: 'Requested',
  paid: 'Paid',
  cancelled: 'Cancelled',
  declined: 'Declined',
  disputed: 'Disputed',
  fulfilled: 'Fulfilled',
  completed: 'Completed',
  new: 'New',
};

export default function HistoryPage() {
  const router = useRouter();
  const items = useMemo<TxItem[]>(() => (transactions as unknown as TxItem[]), []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-center" style={{ color: 'var(--default-primary-color)' }}>My EscrowPi</h1>

      {items.length === 0 ? (
        <div className="text-center text-sm text-gray-600">No transactions yet.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((tx) => {
            const arrow = tx.myRole === 'payer' ? 'You →' : 'You ←';
            return (
              <li key={tx.id} className="rounded-xl border bg-white p-0 shadow-sm overflow-hidden">
                <button className="w-full p-4 text-left" onClick={() => router.push(`/history/${tx.id}`)}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      <span className="mr-2">{arrow}</span>
                      <span>{tx.counterparty}</span>
                    </div>
                    <div className={`text-xs px-2 py-1 rounded border ${statusClasses[tx.status]}`}>{statusLabel[tx.status]}</div>
                  </div>
                  <div className="mt-1 flex items-end justify-between">
                    <div>
                      <div className="text-2xl font-bold">{tx.amount.toFixed(2)} <span className="text-lg align-top">Pi</span></div>
                    </div>
                    <div className="text-xs text-gray-500">{new Date(tx.date).toLocaleString()}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
