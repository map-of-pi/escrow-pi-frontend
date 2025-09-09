"use client";
import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';

// Align statuses to the spec for the history cards
// Display labels must be exactly one of: Pi_requested, Pi_sent, Cancelled, Declined, Disputed, Fullfilled, Completed, New
type TxStatus =
| 'new'
  | 'pi_requested'
  | 'pi_sent'
  | 'cancelled'
  | 'declined'
  | 'disputed'
  | 'fullfilled'
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
  notes?: string;
};

const statusClasses: Record<TxStatus, string> = {
  new: 'bg-slate-50 text-slate-700 border-slate-200',
  pi_requested: 'bg-amber-50 text-amber-800 border-amber-200',
  pi_sent: 'bg-blue-50 text-blue-800 border-blue-200',
  cancelled: 'bg-gray-50 text-gray-700 border-gray-200',
  declined: 'bg-gray-50 text-gray-700 border-gray-200',
  disputed: 'bg-red-50 text-red-800 border-red-200',
  fullfilled: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  completed: 'bg-green-50 text-green-800 border-green-200',
};

const statusLabel: Record<TxStatus, string> = {
  pi_requested: 'Pi_requested',
  pi_sent: 'Pi_sent',
  cancelled: 'Cancelled',
  declined: 'Declined',
  disputed: 'Disputed',
  fullfilled: 'Fullfilled',
  completed: 'Completed',
  new: 'New',
};

export default function HistoryPage() {
  const router = useRouter();
  const items = useMemo<TxItem[]>(
    () => [
      // In-progress first
      { id: 'tx_pi_requested', direction: 'receive', myRole: 'payer', counterparty: '@merchantA', amount: 74.61, status: 'pi_requested', date: '2025-09-03T07:30:00Z', notes: 'Order F-714' },
      { id: 'tx_pi_sent', direction: 'send', myRole: 'payer', counterparty: '@alice', amount: 12.5, status: 'pi_sent', date: '2025-09-01T12:15:00Z', notes: 'Invoice #A1001' },
      { id: 'tx_fullfilled', direction: 'receive', myRole: 'payee', counterparty: '@vendorZ', amount: 5.2, status: 'fullfilled', date: '2025-08-28T09:00:00Z', notes: 'Service ticket #884' },
      { id: 'tx_disputed', direction: 'send', myRole: 'payer', counterparty: '@shopY', amount: 2.75, status: 'disputed', date: '2025-08-27T18:20:00Z', notes: 'Case D-123' },
      // Resolutions / others
      { id: 'tx_completed', direction: 'receive', myRole: 'payer', counterparty: '@bob', amount: 3, status: 'completed', date: '2025-08-24T11:05:00Z', notes: 'Ref B-339' },
      { id: 'tx_cancelled', direction: 'send', myRole: 'payer', counterparty: '@charlie', amount: 1.5, status: 'cancelled', date: '2025-08-20T09:10:00Z' },
      { id: 'tx_declined', direction: 'receive', myRole: 'payee', counterparty: '@mike', amount: 6.0, status: 'declined', date: '2025-08-18T14:45:00Z', notes: 'Order M-778' },
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
                      {tx.notes && <div className="text-xs text-gray-500">{tx.notes}</div>}
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
