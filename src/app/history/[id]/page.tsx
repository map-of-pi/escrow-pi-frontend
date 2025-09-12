"use client";
import React, { useMemo, useState, useEffect, useRef } from 'react';
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
  const [showAccept, setShowAccept] = useState<boolean>(false);
  const [showReject, setShowReject] = useState<boolean>(false);
  const [actionBanner, setActionBanner] = useState<string>("");
  const [showComments, setShowComments] = useState<boolean>(false);
  type Comment = { author: string; text: string; ts: string };
  // Prefer user-provided handle stored in localStorage. Fallback to '@you'.
  const myUsername = useMemo(() => {
    if (typeof window === 'undefined') return '@you';
    const v = window.localStorage.getItem('escrowpi.username');
    return v && v.trim().length ? v.trim() : '@you';
  }, []);
  const initialComments: Comment[] = useMemo(() => {
    if (!tx) return [];
    const author = tx.myRole === 'payer' ? tx.counterparty : myUsername;
    return tx.notes ? [{ author, text: tx.notes, ts: tx.date }] : [];
  }, [tx, myUsername]);
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState<string>("");

  // Commentary preview measurement using translateY to keep latest visible without cutting
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewContentRef = useRef<HTMLDivElement | null>(null);
  const [offsetPx, setOffsetPx] = useState(0);

  useEffect(() => {
    const measure = () => {
      const c = previewContainerRef.current;
      const i = previewContentRef.current;
      if (!c || !i) return;
      const overflow = i.scrollHeight - c.clientHeight;
      const next = overflow > 0 ? Math.ceil(overflow) : 0;
      setOffsetPx((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    };
    // measure once after paint when comments change
    const id = window.requestAnimationFrame(measure);
    const onResize = () => window.requestAnimationFrame(measure);
    window.addEventListener('resize', onResize);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('resize', onResize);
    };
  }, [comments]);

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
    <div className="space-y-4 md:space-y-3 lg:space-y-2 pb-36">
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
        {(tx.status === 'cancelled' || tx.status === 'disputed') && (
          <div className="mt-3 text-xs rounded-md border p-2 bg-gray-50 text-gray-700">
            {tx.status === 'cancelled' && 'This transaction was cancelled.'}
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
        <div className="mt-3 md:mt-2 space-y-3 md:space-y-2 lg:space-y-1 text-sm max-h-[50dvh] overflow-auto">
          
          {/* UC1: Transaction Commentary */}
          <div className="min-h-28" aria-label="Open all comments">
            <div className="font-semibold mb-2 md:mb-1 text-center">Transaction Commentary</div>
            <div
              ref={previewContainerRef}
              className={`rounded-lg border p-3 md:p-2 bg-white h-40 overflow-hidden cursor-pointer hover:bg-gray-50 flex flex-col justify-start`}
              onClick={() => setShowComments(true)}
            >
              {comments.length === 0 ? (
                <div className="text-xs text-gray-600">No comments yet.</div>
              ) : (
                <div
                  ref={previewContentRef}
                  className="space-y-1 text-xs will-change-transform pb-3"
                  style={{ transform: `translateY(-${offsetPx}px)` }}
                >
                  {comments.map((c, idx) => (
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

          {/* UC1: Add New Comment - remains visible, but disabled for terminal states */}
          {(() => {
            const isTerminal = tx.status === 'cancelled' || tx.status === 'declined' || tx.status === 'disputed' || tx.status === 'completed';
            return (
              <div className="min-h-28">
                <div className="font-semibold mb-2 md:mb-1 text-center">Add New Comment</div>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={4}
                  disabled={isTerminal}
                  placeholder={isTerminal ? 'Adding new comments is closed for this transaction.' : 'Type your comment. You can include contact info or links.'}
                  className={`w-full rounded border p-2 text-xs ${isTerminal ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    disabled={isTerminal || newComment.trim().length === 0}
                    className={`px-3 py-2 rounded text-xs font-semibold ${!isTerminal && newComment.trim().length ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                    onClick={() => {
                      const entry: Comment = { author: myUsername, text: newComment.trim(), ts: new Date().toISOString() };
                      setComments((prev) => [...prev, entry]);
                      setNewComment('');
                    }}
                  >
                    Add Comment
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </details>

          {/* UC1/UC2: Action section (varies by status/role) - fixed to bottom */}
          <div
            className="fixed inset-x-0 z-10 px-4"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
            <div className="w-full max-w-md mx-auto">
              <div className="font-semibold mb-2 text-center">Action</div>
              {/* Single Action shell used for ALL scenarios for consistency */}
              <div className="w-full rounded-2xl p-2 bg-[#f5efe2] border border-[#2e6f4f] min-h-16">
                {(() => {
                  const isTerminal = tx.status === 'cancelled' || tx.status === 'declined' || tx.status === 'disputed' || tx.status === 'completed';
                  if (isTerminal) {
                    return (
                      <div className="flex items-center justify-center text-center px-3 text-[13px] md:text-[14px] font-medium text-gray-800 h-full">
                        {tx.status === 'declined' ? (
                          <div>
                            <div className="text-red-700">This transaction was declined</div>
                            <div>No further actions required.</div>
                          </div>
                        ) : (
                          <div>No further actions required.</div>
                        )}
                      </div>
                    );
                  }
                  if (tx.myRole === 'payer' && tx.status === 'pi_requested') {
                    return (
                      <div className="flex items-center gap-2 h-full">
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[#f0b37e] border border-[#d9b07a] hover:brightness-110 active:brightness-105 transition"
                          onClick={() => setShowReject(true)}
                        >
                          Reject
                        </button>
                        <div className="flex-1 text-center px-3 py-2 text-[13px] md:text-[14px] font-medium text-gray-800">Waiting for Payer to accept Payee request for pi transfer</div>
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[#f0b37e] border border-[#d9b07a] hover:brightness-110 active:brightness-105 transition"
                          onClick={() => setShowAccept(true)}
                        >
                          Accept
                        </button>
                      </div>
                    );
                  }
                  // Other action scenarios: keep left/right buttons inside the same shell
                  return (
                    <div className="flex items-center gap-2 h-full">
                      {tx.myRole === 'payee' ? (
                        <>
                          <button
                            disabled={tx.status !== 'pi_sent'}
                            className={`px-4 h-12 rounded-full text-sm font-semibold ${tx.status === 'pi_sent' ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                            onClick={() => setTx({ ...tx, status: 'fulfilled' })}
                          >
                            Mark Fulfilled
                          </button>
                          <div className="flex-1" />
                        </>
                      ) : (
                        <>
                          <div className="flex-1" />
                          <button
                            disabled={tx.status !== 'fulfilled'}
                            className={`px-4 h-12 rounded-full text-sm font-semibold ${tx.status === 'fulfilled' ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                            onClick={() => setTx({ ...tx, status: 'completed' })}
                          >
                            Mark Complete
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

      {/* UC2: Success banner */}
      {actionBanner && (
        <div className="fixed top-[90px] left-0 right-0 z-40 px-4">
          <div className="max-w-md mx-auto rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 text-sm text-center">
            {actionBanner}
          </div>
        </div>
      )}

      {/* UC2: Reject popup (payer at requested) */}
      {tx.myRole === 'payer' && tx.status === 'pi_requested' && (
        <Modal
          open={showReject}
          onClose={() => setShowReject(false)}
          title={
            <div className="text-center space-y-1">
              <div className="font-semibold">Confirm you reject the request to pay pi</div>
              <div className="text-2xl font-bold">{fmt(deriveBreakdown(tx.amount).total)} pi</div>
            </div>
          }
        >
          {(() => { const b = deriveBreakdown(tx.amount); return (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>They get:</span><span>{fmt(b.base)} pi</span></div>
            <div className="flex justify-between"><span>Transaction completion stake:</span><span>{fmt(b.completionStake)} pi</span></div>
            <div className="text-[11px] text-gray-600">(refunded to you at end)</div>
            <div className="flex justify-between"><span>Pi Network gas fees:</span><span>{fmt(b.networkFees)} pi</span></div>
            <div className="flex justify-between"><span>EscrowPi fee:</span><span>{fmt(b.escrowFee)} pi</span></div>
            <div className="pt-2">
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold bg-red-100 text-red-700 border border-red-200"
                onClick={() => {
                  const header: Comment = { author: myUsername, text: `${myUsername} has rejected the pi transfer request.`, ts: new Date().toISOString() };
                  const typed = newComment.trim();
                  setComments((prev) => typed ? [...prev, header, { author: myUsername, text: typed, ts: new Date().toISOString() }] : [...prev, header]);
                  setTx({ ...tx, status: 'declined', needsPayerResponse: false });
                  setShowReject(false);
                  setActionBanner('Action completed successfully');
                  if (typed) setNewComment('');
                  setTimeout(() => setActionBanner(''), 2000);
                }}
              >
                Confirm Reject
              </button>
            </div>
          </div> ); })()}
        </Modal>
      )}

      {/* UC2: Accept popup (payer at requested) */}
      {tx.myRole === 'payer' && tx.status === 'pi_requested' && (
        <Modal
          open={showAccept}
          onClose={() => setShowAccept(false)}
          title={
            <div className="text-center space-y-1">
              <div className="font-semibold">Confirm you accept the request to pay pi</div>
              <div className="text-2xl font-bold">{fmt(deriveBreakdown(tx.amount).total)} pi</div>
            </div>
          }
        >
          {(() => { const b = deriveBreakdown(tx.amount); return (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>They get:</span><span>{fmt(b.base)} pi</span></div>
            <div className="flex justify-between"><span>Transaction completion stake:</span><span>{fmt(b.completionStake)} pi</span></div>
            <div className="text-[11px] text-gray-600">(refunded to you at end)</div>
            <div className="flex justify-between"><span>Pi Network gas fees:</span><span>{fmt(b.networkFees)} pi</span></div>
            <div className="flex justify-between"><span>EscrowPi fee:</span><span>{fmt(b.escrowFee)} pi</span></div>
            <div className="pt-2">
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                onClick={() => {
                  const header: Comment = { author: myUsername, text: `${myUsername} has accepted the pi transfer request.`, ts: new Date().toISOString() };
                  const typed = newComment.trim();
                  setComments((prev) => typed ? [...prev, header, { author: 'You', text: typed, ts: new Date().toISOString() }] : [...prev, header]);
                  setTx({ ...tx, status: 'pi_sent', needsPayerResponse: false });
                  setShowAccept(false);
                  setActionBanner('Action completed successfully');
                  if (typed) setNewComment('');
                  setTimeout(() => setActionBanner(''), 2000);
                }}
              >
                Confirm Accept
              </button>
            </div>
          </div> ); })()}
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
