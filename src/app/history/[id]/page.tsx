"use client";
import React, { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import transactions from '@/data/transactions.json';

type TxStatus = 'pi_requested' | 'pi_sent' | 'cancelled' | 'declined' | 'disputed' | 'fulfilled' | 'completed';

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
  fulfilled: 'Fulfilled',
  completed: 'Completed',
};

const statusClasses: Record<TxStatus, string> = {
  pi_requested: 'bg-amber-50 text-amber-800 border-amber-200',
  pi_sent: 'bg-blue-50 text-blue-800 border-blue-200',
  cancelled: 'bg-gray-50 text-gray-700 border-gray-200',
  declined: 'bg-gray-50 text-gray-700 border-gray-200',
  disputed: 'bg-red-50 text-red-800 border-red-200',
  fulfilled: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  completed: 'bg-green-50 text-green-800 border-green-200',
};

export default function TxDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || '');

  // Load from shared mock JSON
  const initial = useMemo<Tx | undefined>(() => {
    return (transactions as unknown as Tx[]).find((t) => t.id === id);
  }, [id]);

  const [tx, setTx] = useState<Tx | undefined>(initial);
  const [showPopup, setShowPopup] = useState<boolean>(!!(tx?.needsPayerResponse && tx.direction === 'receive' && tx.status === 'pi_requested'));
  const [showComments, setShowComments] = useState<boolean>(false);
  type Comment = { author: string; text: string; ts: string };
  const initialComments: Comment[] = useMemo(() => {
    if (!tx) return [];
    const author = tx.myRole === 'payer' ? tx.counterparty : 'You';
    return tx.notes ? [{ author, text: tx.notes, ts: tx.date }] : [];
  }, [tx]);
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState<string>("");

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
    <div className="space-y-4 pb-36">
      <div className="relative flex items-center gap-2">
        <button
          aria-label="Go back"
          className="inline-flex items-center justify-center h-9 w-9 rounded-full border hover:bg-gray-50"
          onClick={() => router.back()}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-bold text-center" style={{ color: 'var(--default-primary-color)' }}>
          EscrowPi Transaction
        </h1>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            <span className="mr-2">{arrow}</span>
            <span>{tx.counterparty}</span>
          </div>
          <div className={`text-xs px-2 py-1 rounded border ${statusClasses[tx.status]}`}>{statusLabel[tx.status]}</div>
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

      <details open>
        <summary className="cursor-pointer select-none font-semibold inline-flex items-center gap-2 mt-2">
          <span>EscrowPi Transaction Details</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </summary>
        <div className="mt-3 space-y-3 text-sm">
          
          {/* UC1: Transaction Commentary */}
          <div className="min-h-28" aria-label="Open all comments">
            <div className="font-semibold mb-2 text-center">Transaction Commentary</div>
            <div
              className="rounded-lg border p-3 bg-white min-h-40 cursor-pointer hover:bg-gray-50"
              onClick={() => setShowComments(true)}
            >
              {comments.length === 0 ? (
                <div className="text-xs text-gray-600">No comments yet.</div>
              ) : (
                <div className="space-y-1 text-xs">
                  {[...comments].slice(-3).map((c, idx) => (
                    <div key={idx} className="py-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[13px]">{c.author}</span>
                        <span className="text-[11px] text-gray-500">{new Date(c.ts).toLocaleString()}</span>
                      </div>
                      <div className="whitespace-pre-wrap break-words text-[13px]">{c.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* UC1: Add New Comment */}
          <div className="min-h-28">
            <div className="font-semibold mb-2 text-center">Add New Comment</div>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={4}
              placeholder="Type your comment. You can include contact info or links."
              className="w-full rounded border p-2 text-xs"
            />
            <div className="mt-2 flex justify-end">
              <button
                disabled={newComment.trim().length === 0}
                className={`px-3 py-2 rounded text-xs font-semibold ${newComment.trim().length ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500'}`}
                onClick={() => {
                  const entry: Comment = { author: 'You', text: newComment.trim(), ts: new Date().toISOString() };
                  setComments((prev) => [...prev, entry]);
                  setNewComment('');
                }}
              >
                Add Comment
              </button>
            </div>
          </div>
        </div>
      </details>

      {/* UC1: Action section (varies by status/role) - fixed to bottom */}
      <div
        className="fixed inset-x-0 z-10 px-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        <div className="rounded-lg border p-3 bg-gray-50 shadow">
          <div className="font-semibold mb-2">Action</div>
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

            {/* Payee: after payer sends Pi, mark as fulfilled */}
            {tx.myRole === 'payee' ? (
              <button
                disabled={tx.status !== 'pi_sent'}
                className={`py-2 rounded-lg text-sm font-semibold ${tx.status === 'pi_sent' ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500'}`}
                onClick={() => setTx({ ...tx, status: 'fulfilled' })}
              >
                Mark Fulfilled
              </button>
            ) : (
              <button
                disabled={tx.status !== 'fulfilled'}
                className={`py-2 rounded-lg text-sm font-semibold ${tx.status === 'fulfilled' ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500'}`}
                onClick={() => setTx({ ...tx, status: 'completed' })}
              >
                Mark Complete
              </button>
            )}
          </div>
        )}
        {(tx.status === 'cancelled' || tx.status === 'declined' || tx.status === 'disputed' || tx.status === 'completed') && (
          <div className="text-xs text-gray-600">No actions available for this transaction.</div>
        )}
        </div>
      </div>

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

      {/* Full-screen reader for all comments */}
      {showComments && (
        <Modal
          open={showComments}
          onClose={() => setShowComments(false)}
          title={<div className="font-semibold">Transaction Commentary</div>}
          fullScreen
        >
          <div className="space-y-2 text-sm overflow-auto pr-1">
            {comments.length === 0 ? (
              <div className="text-xs text-gray-600">No comments yet.</div>
            ) : (
              comments.map((c, i) => (
                <div key={i} className="py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px]">{c.author}</span>
                    <span className="text-[11px] text-gray-500">{new Date(c.ts).toLocaleString()}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-[13px]">{c.text}</div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
