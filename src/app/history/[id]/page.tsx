"use client";
import React, { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Modal from '@/components/Modal';

type TxStatus = 'pi_requested' | 'pi_sent' | 'cancelled' | 'declined' | 'disputed' | 'fullfilled' | 'completed';

type Tx = {
  id: string;
  direction: 'send' | 'receive';
  myRole: 'payer' | 'payee';
  counterparty: string;
  amount: number;
  status: TxStatus;
  date: string;
  notes?: string;
  needsPayerResponse?: boolean; // show popup when true and this is a receive where I am payer
};

const statusLabel: Record<TxStatus, string> = {
  pi_requested: 'Pi_requested',
  pi_sent: 'Pi_sent',
  cancelled: 'Cancelled',
  declined: 'Declined',
  disputed: 'Disputed',
  fullfilled: 'Fullfilled',
  completed: 'Completed',
};

export default function TxDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || '');

  // Mock store (should come from API)
  const initial = useMemo<Tx | undefined>(() => {
    const all: Tx[] = [
      // As payer: request awaiting my confirmation
      { id: 'tx_pi_requested', direction: 'receive', myRole: 'payer', counterparty: '@merchantA', amount: 74.61, status: 'pi_requested', date: '2025-09-03T07:30:00Z', notes: 'Order F-714', needsPayerResponse: true },
      // As payer: I already sent Pi to Escrow
      { id: 'tx_pi_sent', direction: 'send', myRole: 'payer', counterparty: '@alice', amount: 12.5, status: 'pi_sent', date: '2025-09-01T12:15:00Z', notes: 'Invoice #A1001' },
      // As payee: I have fulfilled the service and waiting payer to complete
      { id: 'tx_fullfilled', direction: 'receive', myRole: 'payee', counterparty: '@vendorZ', amount: 5.2, status: 'fullfilled', date: '2025-08-28T09:00:00Z', notes: 'Service ticket #884' },
      // Either role: disputed
      { id: 'tx_disputed', direction: 'send', myRole: 'payer', counterparty: '@shopY', amount: 2.75, status: 'disputed', date: '2025-08-27T18:20:00Z', notes: 'Case D-123' },
      // Completed
      { id: 'tx_completed', direction: 'receive', myRole: 'payer', counterparty: '@bob', amount: 3, status: 'completed', date: '2025-08-24T11:05:00Z', notes: 'Ref B-339' },
      // Cancelled and Declined examples
      { id: 'tx_cancelled', direction: 'send', myRole: 'payer', counterparty: '@charlie', amount: 1.5, status: 'cancelled', date: '2025-08-20T09:10:00Z' },
      { id: 'tx_declined', direction: 'receive', myRole: 'payee', counterparty: '@mike', amount: 6.0, status: 'declined', date: '2025-08-18T14:45:00Z', notes: 'Order M-778' },
    ];
    return all.find((t) => t.id === id);
  }, [id]);

  const [tx, setTx] = useState<Tx | undefined>(initial);
  const [showPopup, setShowPopup] = useState<boolean>(!!(tx?.needsPayerResponse && tx.direction === 'receive' && tx.status === 'pi_requested'));

  // Helpers to display the popup breakdown like on the mock
  const fmt = (n: number) => {
    if (!Number.isFinite(n)) return '';
    let s = n.toFixed(5);
    if (s.includes('.')) {
      s = s.replace(/0+$/g, '').replace(/\.$/, '');
    }
    return s;
  };

  // Given total (top figure), derive base and fees using the same policy as the homepage
  const deriveBreakdown = (total: number) => {
    // Known constants
    const network = 0.03;
    // Find base such that total ≈ base + stake + network + escrow
    // stake = max(0.1*base, 1)
    // escrow = max(0.03*base, 0.1)
    let lo = 0, hi = Math.max(total, 1);
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const stake = Math.max(0.1 * mid, 1);
      const escrow = Math.max(0.03 * mid, 0.1);
      const t = mid + stake + network + escrow;
      if (t > total) hi = mid; else lo = mid;
    }
    const base = lo;
    const completionStake = Math.max(0.1 * base, 1);
    const escrowFee = Math.max(0.03 * base, 0.1);
    const recomputedTotal = base + completionStake + network + escrowFee;
    return { base, completionStake, networkFees: network, escrowFee, total: recomputedTotal };
  };

  if (!tx) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-600">Transaction not found.</div>
        <button className="px-4 py-2 rounded-lg border" onClick={() => router.push('/history')}>Back to My EscrowPi</button>
      </div>
    );
  }

  const arrow = tx.myRole === 'payer' ? 'You →' : 'You ←';

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
        {(tx.status === 'cancelled' || tx.status === 'declined' || tx.status === 'disputed') && (
          <div className="mt-3 text-xs rounded-md border p-2 bg-gray-50 text-gray-700">
            {tx.status === 'cancelled' && 'This transaction was cancelled.'}
            {tx.status === 'declined' && 'This request was declined.'}
            {tx.status === 'disputed' && 'This transaction is currently in dispute.'}
          </div>
        )}
      </div>

      <details open className="rounded-xl border bg-white p-4 shadow-sm">
        <summary className="cursor-pointer select-none font-semibold">EscrowPi Transaction Details</summary>
        <div className="mt-3 space-y-3 text-sm">
          <div className="rounded-lg border p-3 bg-gray-50">
            <div className="font-semibold mb-2">Transaction Status</div>
            <ol className="space-y-1 text-xs">
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${tx.status !== 'pi_requested' ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                  <span>Pi_requested</span>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-500">{tx.status === 'pi_requested' ? 'Current step' : 'Step complete'}</span>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${(tx.status === 'pi_sent' || tx.status === 'fullfilled' || tx.status === 'completed') ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                  <span>Pi_sent</span>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-500">{tx.status === 'pi_sent' ? 'Current step' : (tx.status === 'pi_requested' ? 'Future step' : 'Step complete')}</span>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${(tx.status === 'fullfilled' || tx.status === 'completed') ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                  <span>Fullfilled</span>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-500">{tx.status === 'fullfilled' ? 'Current step' : (tx.status === 'completed' ? 'Step complete' : 'Future step')}</span>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${tx.status === 'completed' ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                  <span>Completed</span>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-500">{tx.status === 'completed' ? 'Current step' : 'Future step'}</span>
              </li>
            </ol>
          </div>

          {!(tx.status === 'cancelled' || tx.status === 'declined' || tx.status === 'disputed' || tx.status === 'completed') && (
            <div className="grid grid-cols-2 gap-2">
              {/* Payer: respond when requested */}
              <button
                disabled={!(tx.myRole === 'payer' && tx.status === 'pi_requested' && tx.needsPayerResponse)}
                className={`py-2 rounded-lg text-sm font-semibold ${tx.myRole === 'payer' && tx.status === 'pi_requested' && tx.needsPayerResponse ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500'}`}
                onClick={() => setShowPopup(true)}
              >
                Respond to Request
              </button>

              {/* Payee: after payer sends Pi, mark as fullfilled */}
              {tx.myRole === 'payee' ? (
                <button
                  disabled={tx.status !== 'pi_sent'}
                  className={`py-2 rounded-lg text-sm font-semibold ${tx.status === 'pi_sent' ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500'}`}
                  onClick={() => setTx({ ...tx, status: 'fullfilled' })}
                >
                  Mark Fullfilled
                </button>
              ) : (
                <button
                  disabled={tx.status !== 'fullfilled'}
                  className={`py-2 rounded-lg text-sm font-semibold ${tx.status === 'fullfilled' ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500'}`}
                  onClick={() => setTx({ ...tx, status: 'completed' })}
                >
                  Mark Complete
                </button>
              )}
            </div>
          )}
        </div>
      </details>

      {/* Confirm/Decline popup for unresponded receive request where I'm the payer */}
      {tx.myRole === 'payer' && tx.status === 'pi_requested' && tx.needsPayerResponse && (
        <Modal
          open={showPopup}
          onClose={() => setShowPopup(false)}
          title={(
            <div className="space-y-2">
              <div className="text-center">A payee has requested pi from you</div>
              <div className="text-center text-3xl font-semibold">{tx.amount.toFixed(2)} pi</div>
            </div>
          )}
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-y-2">
              {(() => {
                const b = deriveBreakdown(tx.amount);
                return (
                  <>
                    <div>They get:</div>
                    <div className="text-right">{fmt(b.base)} pi</div>

                    <div className="whitespace-nowrap">{"Transaction completion\u00A0stake:"}</div>
                    <div className="text-right">{fmt(b.completionStake)} pi</div>

                    <div className="text-xs text-gray-600 col-span-2 -mt-1">(refunded to you at end)</div>

                    <div>Pi Network gas fees:</div>
                    <div className="text-right">{fmt(b.networkFees)} pi</div>

                    <div>EscrowPi fee:</div>
                    <div className="text-right">{fmt(b.escrowFee)} pi</div>
                  </>
                );
              })()}
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button
                className="py-3 rounded-lg font-semibold shadow-sm"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                onClick={() => {
                  setTx({ ...tx, status: 'pi_sent', needsPayerResponse: false });
                  setShowPopup(false);
                }}
              >
                Confirm Request
              </button>
              <button
                className="py-3 rounded-lg font-semibold shadow-sm"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                onClick={() => {
                  setTx({ ...tx, status: 'declined', needsPayerResponse: false });
                  setShowPopup(false);
                }}
              >
                Decline Request
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
