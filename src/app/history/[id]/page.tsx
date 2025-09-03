"use client";
import React, { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Modal from '@/components/Modal';

type TxStatus = 'new' | 'pi_sent' | 'completed' | 'declined' | 'cancelled' | 'disputed';

type Tx = {
  id: string;
  direction: 'send' | 'receive';
  counterparty: string;
  amount: number;
  status: TxStatus;
  date: string;
  notes?: string;
  needsPayerResponse?: boolean; // show popup when true and this is a receive where I am payer
};

const statusLabel: Record<TxStatus, string> = {
  new: 'New',
  pi_sent: 'Pi Sent',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

export default function TxDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || '');

  // Mock store (should come from API)
  const initial = useMemo<Tx | undefined>(() => {
    const all: Tx[] = [
      { id: 'tx_1202', direction: 'receive', counterparty: '@merchantA', amount: 74.61, status: 'new', date: '2025-09-03T07:30:00Z', notes: 'Order F-714', needsPayerResponse: true },
      { id: 'tx_1201', direction: 'send', counterparty: '@alice', amount: 12.5, status: 'pi_sent', date: '2025-09-01T12:15:00Z', notes: 'Invoice #A1001' },
      { id: 'tx_1199', direction: 'receive', counterparty: '@bob', amount: 3, status: 'completed', date: '2025-08-24T11:05:00Z', notes: 'Ref B-339' },
      { id: 'tx_1198', direction: 'send', counterparty: '@charlie', amount: 1.5, status: 'cancelled', date: '2025-08-20T09:10:00Z' },
    ];
    return all.find((t) => t.id === id);
  }, [id]);

  const [tx, setTx] = useState<Tx | undefined>(initial);
  const [showPopup, setShowPopup] = useState<boolean>(!!(tx?.needsPayerResponse && tx.direction === 'receive' && tx.status === 'new'));

  if (!tx) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-600">Transaction not found.</div>
        <button className="px-4 py-2 rounded-lg border" onClick={() => router.push('/history')}>Back to My EscrowPi</button>
      </div>
    );
  }

  const arrow = tx.direction === 'send' ? 'You →' : 'You ←';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          aria-label="Go back"
          className="inline-flex items-center justify-center h-9 w-9 rounded-full border hover:bg-gray-50"
          onClick={() => router.back()}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--default-primary-color)' }}>EscrowPi Transaction</h1>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            <span className="mr-2">{arrow}</span>
            <span>{tx.counterparty}</span>
          </div>
          <div className="text-xs px-2 py-1 rounded border bg-gray-50">{statusLabel[tx.status]}</div>
        </div>
        <div className="mt-2 text-center">
          <div className="text-sm text-gray-600">Payment transfer amount</div>
          <div className="text-3xl font-bold">{tx.amount.toFixed(2)} <span className="text-xl align-top">Pi</span></div>
        </div>
      </div>

      <details open className="rounded-xl border bg-white p-4 shadow-sm">
        <summary className="cursor-pointer select-none font-semibold">EscrowPi Transaction Details</summary>
        <div className="mt-3 space-y-3 text-sm">
          <div className="rounded-lg border p-3 bg-gray-50">
            <div className="font-semibold mb-2">Transaction Status</div>
            <ol className="space-y-1 text-xs">
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${tx.status !== 'new' ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                  <span>Request created</span>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-500">{tx.status !== 'new' ? 'Step complete' : 'Current step'}</span>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${(tx.status === 'pi_sent' || tx.status === 'completed') ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                  <span>Pi sent to EscrowPi</span>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-500">{tx.status === 'pi_sent' ? 'Current step' : (tx.status === 'completed' ? 'Step complete' : 'Future step')}</span>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${tx.status === 'completed' ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                  <span>Completed / funds released</span>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-500">{tx.status === 'completed' ? 'Current step' : 'Future step'}</span>
              </li>
            </ol>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={!(tx.needsPayerResponse && tx.direction === 'receive' && tx.status === 'new')}
              className={`py-2 rounded-lg text-sm font-semibold ${tx.needsPayerResponse && tx.direction === 'receive' && tx.status === 'new' ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500'}`}
              onClick={() => setShowPopup(true)}
            >
              Respond to Request
            </button>
            <button
              disabled={tx.status !== 'pi_sent'}
              className={`py-2 rounded-lg text-sm font-semibold ${tx.status === 'pi_sent' ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500'}`}
              onClick={() => setTx({ ...tx, status: 'completed' })}
            >
              Mark Complete
            </button>
          </div>
        </div>
      </details>

      {/* Confirm/Decline popup for unresponded receive request where I'm the payer */}
      {tx.needsPayerResponse && tx.direction === 'receive' && tx.status === 'new' && (
        <Modal
          open={showPopup}
          onClose={() => setShowPopup(false)}
          onConfirm={() => {
            setTx({ ...tx, status: 'pi_sent', needsPayerResponse: false });
            setShowPopup(false);
          }}
          confirmText="Confirm Request"
          title={(
            <div className="space-y-2">
              <div className="text-center">A payee has requested pi from you</div>
              <div className="text-center text-3xl font-semibold">{tx.amount.toFixed(2)} pi</div>
            </div>
          )}
        >
          <div className="space-y-2 text-sm">
            <div className="text-center">Transaction details: {tx.notes || '—'}</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                className="py-2 rounded-lg font-semibold bg-gray-200 text-gray-700"
                onClick={() => {
                  setTx({ ...tx, status: 'declined', needsPayerResponse: false });
                  setShowPopup(false);
                }}
              >
                Decline Request
              </button>
              <button
                className="py-2 rounded-lg font-semibold bg-gray-100 text-gray-700"
                onClick={() => setShowPopup(false)}
              >
                Not Now
              </button>
              <button
                className="py-2 rounded-lg font-semibold"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                onClick={() => {
                  setTx({ ...tx, status: 'pi_sent', needsPayerResponse: false });
                  setShowPopup(false);
                }}
              >
                Confirm Request
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
