"use client";
import React, { useMemo } from 'react';

type TxStatus = 'pending' | 'completed' | 'cancelled' | 'disputed';
type Role = 'initiator' | 'counterparty';

type TxItem = {
  id: string;
  role: Role;
  counterparty: string;
  amount: number;
  status: TxStatus;
  date: string; // ISO string
  notes?: string;
};

const statusClasses: Record<TxStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  completed: 'bg-green-50 text-green-800 border-green-200',
  cancelled: 'bg-gray-50 text-gray-700 border-gray-200',
  disputed: 'bg-red-50 text-red-800 border-red-200',
};

export default function HistoryPage() {
  // TODO: Replace with real fetch to backend once API is available
  const items = useMemo<TxItem[]>(
    () => [
      { id: 'tx_1001', role: 'initiator', counterparty: '@alice', amount: 10, status: 'pending', date: '2025-08-26T15:20:00Z', notes: 'Order #A1001' },
      { id: 'tx_1000', role: 'counterparty', counterparty: '@bob', amount: 3, status: 'completed', date: '2025-08-24T11:05:00Z', notes: 'Ref B-339' },
      { id: 'tx_0999', role: 'initiator', counterparty: '@charlie', amount: 1.5, status: 'cancelled', date: '2025-08-20T09:10:00Z' },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-center" style={{ color: 'var(--default-primary-color)' }}>My EscrowPi</h1>

      {items.length === 0 ? (
        <div className="text-center text-sm text-gray-600">No transactions yet.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((tx) => (
            <li key={tx.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">
                  <span className="mr-2">{tx.role === 'initiator' ? 'You →' : 'You ←'}</span>
                  <span>{tx.counterparty}</span>
                </div>
                <div className={`text-xs px-2 py-1 rounded border ${statusClasses[tx.status]}`}>{tx.status}</div>
              </div>
              <div className="mt-1 flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold">{tx.amount.toFixed(2)} <span className="text-lg align-top">Pi</span></div>
                  {tx.notes && <div className="text-xs text-gray-500">{tx.notes}</div>}
                </div>
                <div className="text-xs text-gray-500">{new Date(tx.date).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
