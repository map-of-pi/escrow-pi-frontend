"use client";
import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';

type TxStatus = 'new' | 'pi_sent' | 'completed' | 'declined' | 'cancelled' | 'disputed';
type Direction = 'send' | 'receive';

type TxItem = {
  id: string;
  direction: Direction; // send -> I pay, receive -> I’m being asked to pay
  counterparty: string;
  amount: number;
  status: TxStatus;
  date: string; // ISO
  notes?: string;
};

const statusClasses: Record<TxStatus, string> = {
  new: 'bg-amber-50 text-amber-800 border-amber-200',
  pi_sent: 'bg-blue-50 text-blue-800 border-blue-200',
  completed: 'bg-green-50 text-green-800 border-green-200',
  declined: 'bg-gray-50 text-gray-700 border-gray-200',
  cancelled: 'bg-gray-50 text-gray-700 border-gray-200',
  disputed: 'bg-red-50 text-red-800 border-red-200',
};

export default function HistoryPage() {
  const router = useRouter();
  const items = useMemo<TxItem[]>(
    () => [
      // New/in-progress first
      { id: 'tx_1202', direction: 'receive', counterparty: '@merchantA', amount: 74.61, status: 'new', date: '2025-09-03T07:30:00Z', notes: 'Order F-714' },
      { id: 'tx_1201', direction: 'send', counterparty: '@alice', amount: 12.5, status: 'pi_sent', date: '2025-09-01T12:15:00Z', notes: 'Invoice #A1001' },
      // Completed last
      { id: 'tx_1199', direction: 'receive', counterparty: '@bob', amount: 3, status: 'completed', date: '2025-08-24T11:05:00Z', notes: 'Ref B-339' },
      { id: 'tx_1198', direction: 'send', counterparty: '@charlie', amount: 1.5, status: 'cancelled', date: '2025-08-20T09:10:00Z' },
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
          {items.map((tx) => {
            const arrow = tx.direction === 'send' ? 'You →' : 'You ←';
            return (
              <li key={tx.id} className="rounded-xl border bg-white p-0 shadow-sm overflow-hidden">
                <button className="w-full p-4 text-left" onClick={() => router.push(`/history/${tx.id}`)}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      <span className="mr-2">{arrow}</span>
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
                  <div className="mt-2 text-xs text-gray-600">{tx.direction === 'receive' ? 'Receive Pi' : 'Send Pi'} • Tap for details</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
