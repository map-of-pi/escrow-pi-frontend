"use client";
import React, { useMemo, useState, useEffect, useRef, useContext } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import transactions from '@/data/transactions.json';
import { AppContext } from '@/context/AppContextProvider';
import { fetchSingleUserOrder, updateOrderStatus } from '@/services/orderApi';
import { mapOrdersToTxItems, TxItem, TxStatus, statusClasses, statusLabel, mapCommentsToFrontend, mapCommentToFrontend } from '@/lib';
import { addComment } from '@/services/commentApi';
import { toast } from 'react-toastify';
import { IComment, IOrder, OrderTypeEnum, PaymentDataType } from '@/types';
import { payWithPi } from '@/config/payment';

export default function TxDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || '');

  // Load from shared mock JSON
  const initial = useMemo<TxItem | undefined>(() => {
    return (transactions as unknown as TxItem[]).find((t) => t.id === id);
  }, [id]);

  const [tx, setTx] = useState<TxItem | undefined>(initial);
  const [showPopup, setShowPopup] = useState<boolean>(!!(tx?.needsPayerResponse && tx.direction === 'receive' && tx.status === 'requested'));
  const { currentUser } = useContext(AppContext);
  const [order, setOrder] = useState<TxItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAccept, setShowAccept] = useState<boolean>(false);
  const [showReject, setShowReject] = useState<boolean>(false);
  const [showCancel, setShowCancel] = useState<boolean>(false);
  const [showFulfilled, setShowFulfilled] = useState<boolean>(false);
  const [showDispute, setShowDispute] = useState<boolean>(false);
  const [showReceived, setShowReceived] = useState<boolean>(false);
  // UC9: dispute resolution modals
  const [showSendProposal, setShowSendProposal] = useState<boolean>(false);
  const [showAcceptProposal, setShowAcceptProposal] = useState<boolean>(false);
  const [actionBanner, setActionBanner] = useState<string>("");
  const [showComments, setShowComments] = useState<boolean>(false);
  type Comment = { author: string; text: string; ts: string };

  // Prefer user-provided handle stored in localStorage. Fallback to '@you'.
  const myUsername = useMemo(() => {
    if (typeof window === 'undefined') return '@you';
    const v = currentUser?.pi_username;
    return v ? v.trim() : '@you';
  }, []);

  // const initialComments: Comment[] = useMemo(() => {
  //   if (!tx) return [];
  //   const author = tx.myRole === 'payer' ? tx.counterparty : myUsername;
  //   return comments && comments.length ? [{ author, text: comments[0].text, ts: tx.date }] : [];
  // }, [tx, myUsername]);
  
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState<string>("");

  // UC9: Refund percentage state
  const [refundPercent, setRefundPercent] = useState<number>(20);
  const [refundPercentStr, setRefundPercentStr] = useState<string>('20');
  const [lastProposedPercent, setLastProposedPercent] = useState<number | null>(null);
  const [lastProposedBy, setLastProposedBy] = useState<'payer' | 'payee' | null>(null);

  // Commentary preview measurement using translateY to keep latest visible without cutting
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewContentRef = useRef<HTMLDivElement | null>(null);
  const [offsetPx, setOffsetPx] = useState(0);
  const [orderNo, setOrderNo] = useState<string>("");

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

  // UC9: Keep Accept disabled until there is a counterparty proposal
  useEffect(() => {
    if (tx?.status !== 'disputed') {
      setLastProposedPercent(null);
      setLastProposedBy(null);
    }
  }, [tx?.status]);

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

  useEffect(() => {
    const loadOrder = async () => {
      // await a2uTrigger()
      try {
        if (!currentUser?.pi_username) return;
        const fetchedOrder = await fetchSingleUserOrder(id);
        if (!fetchedOrder) {
          return setTx(undefined);
        }
        
        const txItem = mapOrdersToTxItems([fetchedOrder.order], currentUser.pi_username);
        setTx(txItem[0] ?? undefined);
        setComments(mapCommentsToFrontend(fetchedOrder.comments, currentUser.pi_username))
      } catch (error) {
        console.error("Error loading orders:", error);
      } finally {
        setLoading(false);
      }
    };
    loadOrder();
  }, [currentUser, id]);

  
  const reset = () => {
    setShowDispute(false)
    setShowAccept(false);
  }

  const handleAddComment = async () => {
    try {
      if (!newComment || !currentUser?.pi_username){
        toast.warn('can not add comment');
        return
      }

      const addedComment = await addComment({order_no: id, description: newComment.trim()});
      if (!addedComment || !currentUser?.pi_username){
        toast.warn('can not add comment');
        return
      }

      setComments((prev) => [...prev, mapCommentToFrontend( addedComment, currentUser.pi_username),]);
      setNewComment('');

    } catch (error:any) {
      toast.error('error adding new comment')
    } finally {
      setLoading(false);
    }
  }

  const updateUI = (result:{order:IOrder, comment:IComment}) => {
    const txItem = mapOrdersToTxItems([result.order], currentUser?.pi_username as string);
    setTx(txItem[0]);
    setComments(
      (prev) => [...prev, mapCommentToFrontend( result.comment, currentUser?.pi_username as  string),]
    );
    if (newComment) {
      handleAddComment();
    }
    if (tx?.status==='cancelled')
      setShowCancel(false);
      setActionBanner('Action completed successfully');
  }

  const handleAction = async (newStatus: TxStatus) => {
    if (tx?.status === newStatus) return
    try {
      const result = await updateOrderStatus(id, newStatus);
      if (!result?.order || !currentUser?.pi_username){
        toast.warn('can not find order');
        return
      }
      updateUI(result);     

    } catch (error:any) {
      toast.error('error updating order')
    } finally {
      setLoading(false);
    }
  }

  const onPaymentComplete = async (data:any) => {
    updateUI(data)
    setActionBanner('Action completed successfully');
    setTimeout(() => setActionBanner(''), 2000)
    toast.success("Payment successfull");
    reset();
  }
  
  const onPaymentError = (error: Error) => {
    toast.error('Payment error');
    // setIsSaveLoading(false);
  }
    

  if (!tx) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-600">Transaction not found.</div>
        <button className="px-4 py-2 rounded-lg border" onClick={() => router.push('/history')}>Back to My EscrowPi</button>
      </div>
    );
  }

  const handleSend = async () => {
    if (!currentUser?.pi_uid || !tx || tx?.amount<=0) {
      toast.error('SCREEN.MEMBERSHIP.VALIDATION.USER_NOT_LOGGED_IN_PAYMENT_MESSAGE')
      return 
    }
    // setIsSaveLoading(true)
  
    const paymentData: PaymentDataType = {
      amount: parseFloat(tx?.amount.toString()),
      memo: `Escrow payment between ${currentUser.pi_username} and ${tx?.counterparty}`,
      metadata: { 
        orderType: OrderTypeEnum.Send,
        order_no: id
      },        
    };
    await payWithPi(paymentData, onPaymentComplete, onPaymentError);
  }

  const arrow = tx.myRole === 'payer' ? 'You →' : 'You ←';

  return (
    <div className="space-y-4 md:space-y-3 lg:space-y-2 pb-[180px]">
      <div className="relative flex items-center gap-2">
        <button
          aria-label="Go back"
          className="inline-flex items-center justify-center h-9 w-9 rounded-full border hover:bg-gray-50"
          onClick={() => router.push('/history')}
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
        {/* Disputed banner removed from top card; message is shown in Action area for consistency */}

        {/* UC8/UC6/UC7: Dispute popup (payee at fulfilled OR payer at paid/fulfilled) */}
      {((tx.myRole === 'payee' && tx.status === 'fulfilled') || (tx.myRole === 'payer' && (tx.status === 'paid' || tx.status === 'fulfilled'))) && (
        <Modal
          open={showDispute}
          onClose={() => setShowDispute(false)}
          title={<div className="font-semibold text-center">Confirm you dispute the transaction</div>}
        >
          <div className="space-y-2 text-sm">
            <div className="text-center text-gray-700">This will mark transaction status as disputed.</div>
            <div className="pt-2">
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                onClick={()=> handleAction('disputed')}
              >
                Confirm
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* UC6a: Cancel popup (payer at paid) */}
      {tx.myRole === 'payer' && tx.status === 'paid' && (
        <Modal
          open={showCancel}
          onClose={() => setShowCancel(false)}
          title={<div className="font-semibold text-center">Confirm cancel transaction and refund payment {fmt(deriveBreakdown(tx.amount).total)} pi</div>}
        >
          <div className="space-y-3 text-sm">
            {(() => { const b = deriveBreakdown(tx.amount); return (
              <div className="space-y-2 rounded-lg p-3">
                <div className="flex justify-between"><span>Payer gets refund:</span><span>{fmt(b.base)} pi</span></div>
                <div className="flex justify-between"><span>Stake refunded to Payer:</span><span>{fmt(b.completionStake)} pi</span></div>
                <div className="flex justify-between"><span>Pi Network gas fees:</span><span>{fmt(b.networkFees)} pi</span></div>
                <div className="flex justify-between"><span>EscrowPi fee:</span><span>{fmt(b.escrowFee)} pi</span></div>
              </div>
            ); })()}
            <div className="pt-2">
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                onClick={() => {
                  const ts = new Date().toISOString();
                  const header: Comment = { author: myUsername, text: `User ${myUsername} has marked the transaction as ${statusLabel['cancelled']}.`, ts };
                  const typed = newComment.trim();
                  setComments((prev) => typed ? [...prev, header, { author: myUsername, text: typed, ts }] : [...prev, header]);
                  setTx({ ...tx, status: 'cancelled' });
                  setShowCancel(false);
                  toast.info('Action completed successfully');
                  if (typed) setNewComment('');
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* UC9: Send Proposal popup (payer/payee at disputed) */}
      {tx.status === 'disputed' && (
        <>
          <Modal
            open={showSendProposal}
            onClose={() => setShowSendProposal(false)}
            title={<div className="font-semibold text-center">You propose dispute resolution refund {refundPercent}%</div>}
          >
            {(() => { const b = deriveBreakdown(tx.amount); const refund = (b.base * refundPercent) / 100; const payeeGets = b.base - refund; return (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Payer gets refund:</span><span>{fmt(refund)} pi</span></div>
                <div className="flex justify-between"><span>Payee gets:</span><span>{fmt(payeeGets)} pi</span></div>
                <div className="flex justify-between"><span>Stake refunded to Payer:</span><span>{fmt(b.completionStake)} pi</span></div>
                <div className="flex justify-between"><span>Pi Network gas fees:</span><span>{fmt(b.networkFees)} pi</span></div>
                <div className="flex justify-between"><span>EscrowPi fee:</span><span>{fmt(b.escrowFee)} pi</span></div>
                <div className="pt-2">
                  <button
                    className="w-full py-2 rounded-lg text-sm font-semibold"
                    style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                    onClick={() => {
                      const header: Comment = { author: myUsername, text: `User ${myUsername} has proposed a dispute resolution refund of ${fmt(refundPercent)}%.`, ts: new Date().toISOString() };
                      setComments((prev) => [...prev, header]);
                      setLastProposedPercent(refundPercent);
                      setLastProposedBy(tx.myRole);
                      setShowSendProposal(false);
                      setActionBanner('Action completed successfully');
                      setTimeout(() => setActionBanner(''), 2000);
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            ); })()}
          </Modal>

          {/* Accept Proposal popup (payer/payee at disputed) */}
          <Modal
            open={showAcceptProposal}
            onClose={() => setShowAcceptProposal(false)}
            title={<div className="font-semibold text-center">You accept dispute resolution refund {lastProposedPercent ?? refundPercent}%</div>}
          >
            {(() => { const b = deriveBreakdown(tx.amount); const percent = (lastProposedPercent ?? refundPercent); const refund = (b.base * percent) / 100; const payeeGets = b.base - refund; return (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Payer gets refund:</span><span>{fmt(refund)} pi</span></div>
                <div className="flex justify-between"><span>Payee gets:</span><span>{fmt(payeeGets)} pi</span></div>
                <div className="flex justify-between"><span>Stake refunded to Payer:</span><span>{fmt(b.completionStake)} pi</span></div>
                <div className="flex justify-between"><span>Pi Network gas fees:</span><span>{fmt(b.networkFees)} pi</span></div>
                <div className="flex justify-between"><span>EscrowPi fee:</span><span>{fmt(b.escrowFee)} pi</span></div>
                <div className="pt-2">
                  <button
                    className="w-full py-2 rounded-lg text-sm font-semibold"
                    style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                    onClick={() => {
                      const percent = (lastProposedPercent ?? refundPercent);
                      const accepted: Comment = { author: myUsername, text: `User ${myUsername} accepted proposed dispute resolution refund of ${fmt(percent)}%.`, ts: new Date().toISOString() };
                      const completed: Comment = { author: myUsername, text: `User ${myUsername} has marked the transaction as ${statusLabel['released']}.`, ts: new Date().toISOString() };
                      setComments((prev) => [...prev, accepted, completed]);
                      setTx({ ...tx, status: 'released' });
                      setShowAcceptProposal(false);
                      setActionBanner('Action completed successfully');
                      setTimeout(() => setActionBanner(''), 2000);
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            ); })()}
          </Modal>
        </>
      )}

      {/* UC7: Received popup (payer at fulfilled) */}
      {tx.myRole === 'payer' && tx.status === 'fulfilled' && (
        <Modal
          open={showReceived}
          onClose={() => setShowReceived(false)}
          title={<div className="font-semibold text-center">Confirm purchased item(s) received and release payment</div>}
        >
          <div className="space-y-3 text-sm">
            <div className="text-center text-gray-700">This will mark transaction status as {statusLabel['released']}.</div>
            {(() => { const b = deriveBreakdown(tx.amount); return (
              <div className="space-y-2 rounded-lg border border-black p-3">
                <div className="flex justify-between"><span>Payee gets:</span><span>{fmt(b.base)} pi</span></div>
                <div className="flex justify-between"><span>Stake refunded to Payer:</span><span>{fmt(b.completionStake)} pi</span></div>
                <div className="flex justify-between"><span>Pi Network gas fees:</span><span>{fmt(b.networkFees)} pi</span></div>
                <div className="flex justify-between"><span>EscrowPi fee:</span><span>{fmt(b.escrowFee)} pi</span></div>
                <div className="flex justify-between font-semibold"><span>Total:</span><span>{fmt(b.total)} pi</span></div>
              </div>
            ); })()}
            <div className="pt-2">
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                onClick={() => {
                  const header: Comment = { author: myUsername, text: `User ${myUsername} has marked the transaction as ${statusLabel['released']}.`, ts: new Date().toISOString() };
                  setComments((prev) => [...prev, header]);
                  setTx({ ...tx, status: 'released' });
                  setShowReceived(false);
                  setActionBanner('Action completed successfully');
                  setTimeout(() => setActionBanner(''), 2000);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* UC5: Fulfilled popup (payee at paid) */}
      {tx.myRole === 'payee' && tx.status === 'paid' && (
        <Modal
          open={showFulfilled}
          onClose={() => setShowFulfilled(false)}
          title={<div className="font-semibold text-center">Confirm you have fulfilled the purchase</div>}
        >
          <div className="space-y-2 text-sm">
            <div className="text-center text-gray-700">This will mark transaction status as fulfilled.</div>
            <div className="pt-2">
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                onClick={() => {
                  const header: Comment = { author: myUsername, text: `User ${myUsername} has marked the transaction as ${statusLabel['fulfilled']}.`, ts: new Date().toISOString() };
                  const typed = newComment.trim();
                  setComments((prev) => typed ? [...prev, header, { author: myUsername, text: typed, ts: new Date().toISOString() }] : [...prev, header]);
                  setTx({ ...tx, status: 'fulfilled' });
                  setShowFulfilled(false);
                  setActionBanner('Action completed successfully');
                  if (typed) setNewComment('');
                  setTimeout(() => setActionBanner(''), 2000);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* UC3: Cancel popup (payee at requested) */}
      {tx.myRole === 'payee' && tx.status === 'requested' && (
        <Modal
          open={showCancel}
          onClose={() => setShowCancel(false)}
          title={<div className="font-semibold text-center">Confirm you cancel the request to pay pi</div>}
        >
          <div className="space-y-2 text-sm">
            <div className="text-center text-gray-700">This will cancel the current Pi transfer request.</div>
            <div className="pt-2">
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                onClick={() => handleAction('cancelled')}
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
      </div>

      <details className="group">
        <summary className="cursor-pointer select-none font-semibold inline-flex items-center gap-2 mt-2">
          <span>EscrowPi Transaction Details</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform duration-200 group-open:rotate-90">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </summary>
        <div className="mt-3 md:mt-2 text-sm">
          {(() => { const b = deriveBreakdown(tx.amount); const refundNote = tx.myRole === 'payer' ? '(refunded to you at end)' : '(refunded to the payer at end)'; const getLabel = tx.myRole === 'payee' ? 'You get:' : 'Payee gets:'; return (
            <div className="space-y-2 rounded-lg border border-black p-3">
              <div className="flex justify-between"><span>{getLabel}</span><span>{fmt(b.base)} pi</span></div>
              <div className="flex justify-between"><span>Transaction completion stake:</span><span>{fmt(b.completionStake)} pi</span></div>
              <div className="text-[11px] text-gray-600">{refundNote}</div>
              <div className="flex justify-between"><span>Pi Network gas fees:</span><span>{fmt(b.networkFees)} pi</span></div>
              <div className="flex justify-between"><span>EscrowPi fee:</span><span>{fmt(b.escrowFee)} pi</span></div>
              <div className="flex justify-between font-semibold"><span>Total:</span><span>{fmt(b.total)} pi</span></div>
            </div>
          ); })()}
        </div>
      </details>

      {/* Audit Log (outside details) */}
      <div className="mt-3 md:mt-2 space-y-3 md:space-y-2 lg:space-y-1 text-sm">
        <div className="min-h-28" aria-label="Open all comments">
          <div className="font-semibold mb-2 md:mb-1 text-center">Audit Log</div>
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

        {/* Add New Comment (outside details) - remains visible, but disabled for terminal states */}
        {(() => {
          // Disputed is not terminal for UC9
          const isTerminal = tx.status === 'cancelled' || tx.status === 'declined' || tx.status === 'released';
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
                  onClick={() => handleAddComment()}
                >
                  Add Comment
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Spacer to avoid overlap with fixed Action bar */}
      <div className="h-[120px]" aria-hidden></div>

          {/* UC1/UC2: Action section (varies by status/role) - fixed to bottom */}
          <div
            className="fixed inset-x-0 z-10 px-4 bg-[var(--default-bg-color)]"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
            <div className="w-full max-w-md mx-auto">
              <div className="font-semibold mb-2 text-center">Action</div>
              {/* Single Action shell; height depends on status (larger for disputed only) */}
              <div className={`w-full rounded-2xl p-2 bg-[#f5efe2] border border-[#2e6f4f] ${tx.status === 'disputed' ? 'h-[100px]' : 'h-[72px]'} overflow-hidden`}>
                {(() => {
                  const isTerminal = tx.status === 'cancelled' || tx.status === 'declined' || tx.status === 'released';
                  if (isTerminal) {
                    return (
                      <div className="flex items-center justify-center text-center px-3 text-[13px] md:text-[14px] font-medium text-gray-800 h-full leading-tight overflow-hidden">
                        {tx.status === 'declined' ? (
                          <div>
                            <div className="text-red-700">This transaction was declined</div>
                            <div>No further actions required.</div>
                          </div>
                        ) : tx.status === 'cancelled' ? (
                          <div>
                            <div>This transaction was cancelled.</div>
                            <div>No further actions required.</div>
                          </div>
                        ) : tx.status === 'disputed' ? (
                          <div>
                            <div className="text-red-700">This transaction is marked as disputed.</div>
                            <div>No further actions required.</div>
                          </div>
                        ) : tx.status === 'released' ? (
                          <div>
                            <div className="text-green-700">This transaction is marked as Completed.</div>
                            <div>No further actions required.</div>
                          </div>
                        ) : (
                          <div>No further actions required.</div>
                        )}
                      </div>
                    );
                  }
                  // UC9: Both roles at Disputed
                  if (tx.status === 'disputed') {
                    const matchesProposal = lastProposedPercent !== null && lastProposedBy !== tx.myRole && Math.abs(refundPercent - lastProposedPercent) < 1e-9;
                    return (
                      <div className="h-full flex flex-col">
                        {/* Top strip: Dispute Centre */}
                        <div className="text-center text-[12px] font-semibold rounded-md px-2 py-1 mb-1"
                             style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}>
                          Dispute Centre
                        </div>
                        {/* Content row */}
                        <div className="flex-1 grid grid-cols-3 items-center gap-2">
                          <div className="flex justify-start">
                            <button
                              disabled={matchesProposal}
                              className={`px-3 h-12 rounded-full text-xs font-semibold ${!matchesProposal ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                              onClick={() => setShowSendProposal(true)}
                            >
                              <span className="flex flex-col leading-tight items-center">
                                <span>Send</span>
                                <span>Proposal</span>
                              </span>
                            </button>
                          </div>
                          <div className="flex flex-col items-center justify-center leading-tight">
                            <div className="text-[11px] text-gray-800">Proposed refund</div>
                            <div className="text-[10px] text-gray-600">(0-100%)</div>
                            <div className="flex items-baseline justify-center mt-0.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                className="w-16 text-center bg-transparent border-0 outline-none text-[20px] font-bold"
                                value={refundPercentStr}
                                onChange={(e) => {
                                  let s = e.target.value || '';
                                  // allow digits and a single dot
                                  s = s.replace(/[^0-9.]/g, '');
                                  const parts = s.split('.');
                                  if (parts.length > 2) {
                                    s = parts[0] + '.' + parts.slice(1).join('');
                                  }
                                  // enforce max 2 decimal places while typing
                                  const p2 = s.split('.');
                                  if (p2.length === 2 && p2[1].length > 2) {
                                    p2[1] = p2[1].slice(0, 2);
                                    s = p2.join('.');
                                  }
                                  // remove leading zeros before a digit (keep single 0 or 0.xxx)
                                  s = s.replace(/^0+(?=\d)/, '');
                                  // clamp to 0..100
                                  if (s !== '' && s !== '.') {
                                    let n = Number(s);
                                    if (!Number.isFinite(n)) n = 0;
                                    if (n > 100) { n = 100; s = '100'; }
                                    if (n < 0) { n = 0; s = '0'; }
                                    setRefundPercent(n);
                                  } else {
                                    // empty or just dot -> treat as 0 while typing
                                    setRefundPercent(0);
                                  }
                                  setRefundPercentStr(s);
                                }}
                                onBlur={() => {
                                  // normalize to at most 2 decimals and strip trailing dot/zeros
                                  let s = refundPercentStr;
                                  if (s === '' || s === '.') { s = '0'; }
                                  const n = Math.min(100, Math.max(0, Number(s)));
                                  const fixed = Number.isFinite(n) ? n.toFixed(2) : '0.00';
                                  // remove trailing zeros/decimal
                                  let norm = fixed.replace(/0+$/,'').replace(/\.$/,'');
                                  if (norm === '') norm = '0';
                                  setRefundPercent(Number(norm));
                                  setRefundPercentStr(norm);
                                }}
                              />
                              <span className="ml-1 text-[16px] font-bold">%</span>
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <button
                              disabled={!matchesProposal}
                              className={`px-3 h-12 rounded-full text-xs font-semibold ${matchesProposal ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                              onClick={() => setShowAcceptProposal(true)}
                            >
                              <span className="flex flex-col leading-tight items-center">
                                <span>Accept</span>
                                <span>Proposal</span>
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  if (tx.myRole === 'payer' && tx.status === 'requested') {
                    return (
                      <div className="flex items-center gap-2 h-full">
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[#f0b37e] border border-[#d9b07a] hover:brightness-110 active:brightness-105 transition"
                          onClick={() => setShowReject(true)}
                        >
                          Reject
                        </button>
                        <div className="flex-1 text-center px-3 text-[13px] md:text-[14px] font-medium text-gray-800">Waiting for Payer to accept Payee request for pi transfer</div>
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[#f0b37e] border border-[#d9b07a] hover:brightness-110 active:brightness-105 transition"
                          onClick={() => setShowAccept(true)} 
                        >
                          Accept
                        </button>
                      </div>
                    );
                  }
                  if (tx.myRole === 'payee' && tx.status === 'requested') {
                    // UC3: Single action; keep the only button to the right
                    return (
                      <div className="flex items-center gap-2 h-full">
                        <div className="flex-1 px-3 text-[13px] md:text-[14px] font-medium text-gray-800 text-left">
                          Waiting for Payer to accept Payee request for pi transfer
                        </div>
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[#f0b37e] border border-[#d9b07a] hover:brightness-110 active:brightness-105 transition"
                          onClick={() => setShowCancel(true)}
                        >
                          Cancel
                        </button>
                      </div>
                    );
                  }
                  // UC5: Payee at Paid (paid): Comment + Fulfilled
                  if (tx.myRole === 'payee' && tx.status === 'paid') {
                    return (
                      <div className="flex items-center gap-2 h-full">
                        <div className="flex-1 px-3 text-[13px] md:text-[14px] font-medium text-gray-800 text-left">
                          Waiting for Payee fulfillment of the purchased item(s)
                        </div>
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
                          onClick={() => setShowFulfilled(true)}
                        >
                          Fulfilled
                        </button>
                      </div>
                    );
                  }
                  // UC8: Payee at Fulfilled: message + Dispute (single-button layout)
                  if (tx.myRole === 'payee' && tx.status === 'fulfilled') {
                    return (
                      <div className="flex items-center gap-2 h-full">
                        <div className="flex-1 px-3 text-[13px] md:text-[14px] font-medium text-gray-800 text-left">
                          Waiting for Payer to confirm purchased items received OK
                        </div>
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
                          onClick={() => setShowDispute(true)}
                        >
                          Dispute
                        </button>
                      </div>
                    );
                  }
                  // UC6: Payer at Paid (paid): message + Dispute (single-button layout)
                  if (tx.myRole === 'payer' && tx.status === 'paid') {
                    return (
                      <div className="flex items-center gap-2 h-full">
                        <div className="flex-1 px-3 text-[13px] md:text-[14px] font-medium text-gray-800 text-left">
                          Waiting for payee to fulfill the purchased item(s)
                        </div>
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
                          onClick={() => setShowDispute(true)}
                        >
                          Dispute
                        </button>
                      </div>
                    );
                  }
                  // UC7: Payer at Fulfilled: Dispute + Received
                  if (tx.myRole === 'payer' && tx.status === 'fulfilled') {
                    return (
                      <div className="flex items-center gap-2 h-full">
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
                          onClick={() => setShowDispute(true)}
                        >
                          Dispute
                        </button>
                        <div className="flex-1 px-3 text-[13px] md:text-[14px] font-medium text-gray-800 text-left">
                          Waiting for Payer to confirm purchased items received OK
                        </div>
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
                          onClick={() => setShowReceived(true)}
                        >
                          Received
                        </button>
                      </div>
                    );
                  }
                  // Other action scenarios: keep left/right buttons inside the same shell
                  return (
                    <div className="flex items-center gap-2 h-full">
                      {tx.myRole === 'payee' ? (
                        <>
                          <div className="flex-1"/>
                        </>
                      ) : (
                        <>
                          <div className="flex-1" />
                          <button
                            disabled={tx.status !== 'fulfilled'}
                            className={`px-4 h-12 rounded-full text-sm font-semibold ${tx.status === 'fulfilled' ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                            onClick={() => {
                              if (tx.status !== 'fulfilled') return;
                              const header: Comment = { author: myUsername, text: `User ${myUsername} has marked the transaction as ${statusLabel['released']}.`, ts: new Date().toISOString() };
                              setComments((prev) => [...prev, header]);
                              setTx({ ...tx, status: 'released' });
                              setActionBanner('Action completed successfully');
                              setTimeout(() => setActionBanner(''), 2000);
                            }}
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
      {tx.myRole === 'payer' && tx.status === 'requested' && (
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
                  const header: Comment = { author: myUsername, text: `User ${myUsername} has marked the transaction as ${statusLabel['declined']}.`, ts: new Date().toISOString() };
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
      {tx.myRole === 'payer' && tx.status === 'requested' && (
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
                onClick={() =>handleSend()}
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
          title={<div className="font-semibold">Audit Log</div>}
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
