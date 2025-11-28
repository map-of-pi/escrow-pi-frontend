"use client";
import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import TxHeaderCard from '@/components/TxHeaderCard';
import TxDetailsBreakdown from '@/components/TxDetailsBreakdown';
import AuditLogPreview from '@/components/AuditLogPreview';
import CommentEditor from '@/components/CommentEditor';
import { AppContext } from '@/context/AppContextProvider';
import { fetchSingleUserOrder, updateOrderStatus, proposeDispute, acceptDispute } from '@/services/orderApi';
import { mapOrdersToTxItems, TxItem, TxStatus, statusClasses, statusLabel, mapCommentsToFrontend, mapCommentToFrontend, fmt, deriveBreakdown } from '@/lib';
import { addComment } from '@/services/commentApi';
import { payWithPi } from '@/config/payment';
import { toast } from 'react-toastify';
import { IComment, IOrder, OrderTypeEnum, PaymentDataType } from '@/types';

export default function TxDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || '');

  const [tx, setTx] = useState<TxItem | undefined>(undefined);
  const { currentUser } = useContext(AppContext);
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

  
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState<string>("");

  // UC9: Refund percentage state
  const [refundPercent, setRefundPercent] = useState<number>(20);
  const [refundPercentStr, setRefundPercentStr] = useState<string>('20');
  const [lastProposedPercent, setLastProposedPercent] = useState<number | null>(null);
  const [lastProposedBy, setLastProposedBy] = useState<'payer' | 'payee' | null>(null);
  const [lastProposedByUsername, setLastProposedByUsername] = useState<string | null>(null);
  const [acceptedByUsername, setAcceptedByUsername] = useState<string | null>(null);
  const [disputeStatus, setDisputeStatus] = useState<'none' | 'proposed' | 'accepted' | 'declined' | 'cancelled'>('none');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

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

  // UC9: Keep Accept disabled until there is a counterparty proposal
  useEffect(() => {
    if (tx?.status !== 'disputed') {
      setLastProposedPercent(null);
      setLastProposedBy(null);
    }
  }, [tx?.status]);

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
        const d = fetchedOrder.order.dispute;
        if (d && d.status === 'proposed') {
          if (typeof d.proposal_percent === 'number') {
            const pct = d.proposal_percent;
            setRefundPercent(pct);
            setRefundPercentStr(String(pct));
            setLastProposedPercent(pct);
          }
          const proposer = d.proposed_by;
          if (proposer) {
            const role = proposer === fetchedOrder.order.sender_username ? 'payer' : 'payee';
            setLastProposedBy(role);
            setLastProposedByUsername(proposer);
          }
          setDisputeStatus('proposed');
          setAcceptedByUsername(null);
        } else if (d && d.status === 'accepted') {
          if (typeof d.proposal_percent === 'number') {
            const pct = d.proposal_percent;
            setRefundPercent(pct);
            setRefundPercentStr(String(pct));
            setLastProposedPercent(pct);
          }
          setLastProposedByUsername(d.proposed_by || null);
          setAcceptedByUsername(d.accepted_by || null);
          setDisputeStatus('accepted');
        } else if (d && (d.status === 'none' || d.status === 'declined' || d.status === 'cancelled')) {
          // Explicitly no active dispute -> clear proposal metadata and keep input at default (initial state already 20)
          setLastProposedPercent(null);
          setLastProposedBy(null);
          setLastProposedByUsername(null);
          setAcceptedByUsername(null);
          setDisputeStatus(d.status as any);
        } else {
          // If backend omitted dispute or returned an unrecognized state; just preserve current UI state by avoiding jarring resets.
        }
        setIsRefreshing(false);
      } catch (error) {
        console.error("Error loading orders:", error);
        setIsRefreshing(false);
      }
    };
    loadOrder();
  }, [currentUser, id, refreshTick]);

  
  const reset = () => {
    setShowDispute(false)
    setShowAccept(false);
    setShowReceived(false);
    setShowFulfilled(false);
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
    if (tx?.status) {
      setShowCancel(false);
    }
  }

  const handleAction = async (newStatus: TxStatus) => {
    if (tx?.status === newStatus) return
    try {
      const result = await updateOrderStatus(id, newStatus);
      if (!result?.order || !currentUser?.pi_username){
        toast.warn('can not find order');
        return
      }
      const txItem = mapOrdersToTxItems([result.order], currentUser.pi_username);
      setTx(txItem[0]);
      setComments((prev) => [...prev, mapCommentToFrontend( result.comment, currentUser.pi_username),]);
      setShowDispute(false)

      // Success feedback
      toast.success(`Status updated to ${statusLabel[newStatus]}`);

      if (newComment) {
        handleAddComment();
      }

    } catch (error:any) {
      toast.error('error updating order')
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
      <TxHeaderCard
        tx={tx}
        arrowLabel={arrow}
        isRefreshing={isRefreshing}
        onBack={() => router.push('/history')}
        onRefresh={() => {
          if (!isRefreshing) {
            setIsRefreshing(true);
            setRefreshTick((t) => t + 1);
          }
        }}
      />

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            <span className="mr-2">{arrow}</span>
            <span>{tx.counterparty}</span>
          </div>
          <div className={`text-xs px-2 py-1 rounded border ${statusClasses[tx.status]}`}>{statusLabel[tx.status]}</div>
        </div>
        <div className="mt-1 flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold">
              {tx.amount.toFixed(2)} <span className="text-lg align-top">Pi</span>
            </div>
            <div className="text-xs text-gray-500">{tx.id}</div>
          </div>
          <div className="text-xs text-gray-500">{new Date(tx.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>
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

      {/* UC0: Cancel popup (any transactions at initiated) */}
      {tx.status === 'initiated' && (
        <Modal
          open={showCancel}
          onClose={() => setShowCancel(false)}
          title={<div className="font-semibold text-center">Confirm you wish to cancel the initiated transaction</div>}
        >
          <div className="space-y-2 text-sm">
            <div className="text-center text-gray-700">This will cancel the initiated transaction.</div>
            <div className="pt-2">
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                onClick={() => {
                  setShowCancel(false);
                  handleAction('cancelled');
                }}
              >
                Confirm Cancel
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
          title={(() => { const b = deriveBreakdown(tx.amount); const networkRefund = 0.01; const refundTotal = b.base + b.completionStake + networkRefund; return (
            <div className="text-center space-y-1">
              <div className="font-semibold">Confirm cancel transaction and get refund</div>
              <div className="text-2xl font-bold">{fmt(refundTotal)} pi</div>
            </div>
          ); })()}
        >
          <div className="space-y-3 text-sm">
            {(() => { const b = deriveBreakdown(tx.amount); const networkRefund = 0.01; const networkNotRefunded = 0.01; const refundTotal = b.base + b.completionStake + networkRefund; return (
              <div className="space-y-2 rounded-lg p-3">
                <div className="flex justify-between"><span>Payer amount (refunded):</span><span>{fmt(b.base)} pi</span></div>
                <div className="flex justify-between"><span>Transaction Stake (refunded):</span><span>{fmt(b.completionStake)} pi</span></div>
                <div className="flex justify-between"><span>Pi Network gas fees (refunded):</span><span>{fmt(networkRefund)} pi</span></div>
                <div className="flex justify-between font-semibold border-t pt-2"><span>Total refunded:</span><span>{fmt(refundTotal)} pi</span></div>
              </div>
            ); })()}
            <div className="pt-2">
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                onClick={() => {
                  setShowCancel(false);
                  handleAction('cancelled');
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
                { Math.abs(refundPercent - 100) < 1e-9 && <div className="flex justify-between"><span>Pi Network gas fees (refunded to payer):</span><span>{fmt(0.01)} pi</span></div> }
                <div className="flex justify-between font-semibold border-t pt-2"><span>Total refunded:</span><span>{fmt(refund + b.completionStake + (Math.abs(refundPercent - 100) < 1e-9 ? 0.01 : 0))} pi</span></div>
                <div className="pt-2">
                  <button
                    className="w-full py-2 rounded-lg text-sm font-semibold"
                    style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                    onClick={async () => {
                      try {
                        const percentVal = parseFloat(refundPercentStr);
                        const chosen = Number.isFinite(percentVal) ? percentVal : refundPercent;
                        const res = await proposeDispute(id, { percent: chosen });
                        if (!res) {
                          toast.error('Failed to propose dispute');
                          return;
                        }
                        const refreshed = await fetchSingleUserOrder(id);
                        if (refreshed) {
                          const txItem = mapOrdersToTxItems([refreshed.order], currentUser?.pi_username as string);
                          setTx(txItem[0] ?? null);
                          setComments(mapCommentsToFrontend(refreshed.comments, currentUser?.pi_username as string));
                          const d = refreshed.order.dispute;
                          if (d && d.status === 'proposed') {
                            if (typeof d.proposal_percent === 'number') {
                              const pct = d.proposal_percent;
                              setRefundPercent(pct);
                              setRefundPercentStr(String(pct));
                              setLastProposedPercent(pct);
                            }
                            const proposer = d.proposed_by;
                            if (proposer) {
                              const role = proposer === refreshed.order.sender_username ? 'payer' : 'payee';
                              setLastProposedBy(role);
                              setLastProposedByUsername(proposer);
                            }
                            setDisputeStatus('proposed');
                            setAcceptedByUsername(null);
                          }
                        }
                        setShowSendProposal(false);
                        setActionBanner('Action completed successfully');
                        setTimeout(() => setActionBanner(''), 2000);
                        toast.success('Dispute proposal sent');
                      } catch (e) {
                        toast.error('Error sending dispute proposal');
                      }
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
                { Math.abs(percent - 100) < 1e-9 && <div className="flex justify-between"><span>Pi Network gas fees (refunded to payer):</span><span>{fmt(0.01)} pi</span></div> }
                <div className="flex justify-between font-semibold border-t pt-2"><span>Total refunded:</span><span>{fmt(refund + b.completionStake + (Math.abs(percent - 100) < 1e-9 ? 0.01 : 0))} pi</span></div>
                <div className="pt-2">
                  <button
                    className="w-full py-2 rounded-lg text-sm font-semibold"
                    style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
                    onClick={async () => {
                      try {
                        const res = await acceptDispute(id, {});
                        if (!res) {
                          toast.error('Failed to accept dispute');
                          return;
                        }
                        const refreshed = await fetchSingleUserOrder(id);
                        if (refreshed) {
                          const txItem = mapOrdersToTxItems([refreshed.order], currentUser?.pi_username as string);
                          setTx(txItem[0] ?? null);
                          setComments(mapCommentsToFrontend(refreshed.comments, currentUser?.pi_username as string));
                          const d = refreshed.order.dispute;
                          if (d) {
                            if (d.status === 'accepted') {
                              if (typeof d.proposal_percent === 'number') {
                                const pct = d.proposal_percent;
                                setRefundPercent(pct);
                                setRefundPercentStr(String(pct));
                                setLastProposedPercent(pct);
                              }
                              setLastProposedByUsername(d.proposed_by || null);
                              setAcceptedByUsername(d.accepted_by || null);
                              setDisputeStatus('accepted');
                            } else if (d.status === 'proposed') {
                              setDisputeStatus('proposed');
                            } else {
                              setLastProposedPercent(null);
                              setLastProposedBy(null);
                              setLastProposedByUsername(null);
                              setAcceptedByUsername(null);
                              setDisputeStatus((d.status as any) || 'none');
                            }
                          }
                        }
                        setShowAcceptProposal(false);
                        setActionBanner('Action completed successfully');
                        setTimeout(() => setActionBanner(''), 2000);
                        toast.success('Dispute proposal accepted');
                      } catch (e) {
                        toast.error('Error accepting dispute');
                      }
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
                  setShowReceived(false);
                  handleAction('released');
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
                  setShowFulfilled(false);
                  handleAction('fulfilled');
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
                onClick={() => {
                  setShowCancel(false);
                  handleAction('cancelled');
                }}
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
      </div>

      <TxDetailsBreakdown tx={tx} />

      {/* Audit Log (outside details) */}
      <div className="mt-3 md:mt-2 space-y-3 md:space-y-2 lg:space-y-1 text-sm">
        <AuditLogPreview
          comments={comments}
          offsetPx={offsetPx}
          previewContainerRef={previewContainerRef}
          previewContentRef={previewContentRef}
          onOpen={() => setShowComments(true)}
        />

        {/* Add New Comment (outside details) - remains visible, but disabled for terminal states */}
        {(() => {
          // Disputed is not terminal for UC9
          const isTerminal = tx.status === 'cancelled' || tx.status === 'declined' || tx.status === 'released';
          return (
            <CommentEditor
              value={newComment}
              onChange={setNewComment}
              onSubmit={handleAddComment}
              disabled={isTerminal}
            />
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
              <div className={`w-full rounded-2xl p-2 bg-[#f5efe2] border border-[#2e6f4f] ${tx.status === 'disputed' ? 'min-h-[120px]' : 'h-[72px]'}`}>
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
                    // Enable/disable rules per spec:
                    // - Initially: no active proposal -> Send enabled, Accept disabled
                    // - When one party proposes: proposer has both disabled; counterparty has both enabled
                    const isAccepted = disputeStatus === 'accepted';
                    const hasProposal = disputeStatus === 'proposed' && lastProposedPercent !== null;
                    const isProposer = hasProposal && lastProposedBy === tx.myRole;
                    const inputValid = refundPercent >= 0 && refundPercent <= 100;
                    const equalsCurrent = hasProposal && lastProposedPercent !== null && Math.abs(refundPercent - lastProposedPercent) < 1e-9;
                    const sendDisabled = isAccepted || !inputValid || (hasProposal && (isProposer || equalsCurrent));
                    const acceptDisabled = isAccepted || !hasProposal || isProposer || !equalsCurrent;
                    const inputDisabled = isAccepted || (hasProposal && isProposer);
                    return (
                      <div className="h-full flex flex-col">
                        {/* Top strip: Dispute Centre */}
                        <div className="text-center text-[12px] font-semibold rounded-md px-2 py-1 mb-1"
                             style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}>
                          Dispute Centre
                        </div>
                        {/* Show proposal status summary (always) */}
                        <div className="text-center text-[11px] text-gray-700 mb-1">
                          {isAccepted ? (
                            <>
                              Accepted proposal: <span className="font-semibold">{lastProposedPercent ?? 0}%</span>
                              {lastProposedByUsername ? (
                                <> — Proposed by: <span className="font-semibold">{lastProposedByUsername}</span></>
                              ) : null}
                              {acceptedByUsername ? (
                                <> & Accepted by: <span className="font-semibold">{acceptedByUsername}</span></>
                              ) : null}
                            </>
                          ) : hasProposal && lastProposedPercent !== null ? (
                            <>
                              Current proposal: <span className="font-semibold">{lastProposedPercent}%</span>
                              {lastProposedByUsername ? (
                                <> by <span className="font-semibold">{lastProposedByUsername}</span></>
                              ) : null}
                            </>
                          ) : (
                            <>Current proposal: <span className="font-semibold">None</span></>
                          )}
                        </div>
                        {/* Content row */}
                        <div className="flex-1 grid grid-cols-3 items-center gap-2">
                          <div className="flex justify-start">
                            <button
                              disabled={sendDisabled}
                              className={`px-3 h-12 rounded-full text-xs font-semibold ${!sendDisabled ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                              onClick={() => setShowSendProposal(true)}
                            >
                              <span className="flex flex-col leading-tight items-center">
                                <span>Send</span>
                                <span>Proposal</span>
                              </span>
                            </button>
                          </div>
                          <div className="flex flex-col items-center justify-center leading-tight">
                            <div className={`text-[11px] ${inputDisabled ? 'text-gray-400' : 'text-gray-800'}`}>Propose refund</div>
                            <div className={`text-[10px] ${inputDisabled ? 'text-gray-400' : 'text-gray-600'}`}>(0-100%)</div>
                            <div className="flex items-baseline justify-center mt-0.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                disabled={inputDisabled}
                                className={`w-16 text-center bg-transparent border-0 outline-none text-[20px] font-bold ${inputDisabled ? 'text-gray-400 cursor-not-allowed' : ''}`}
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
                              <span className={`ml-1 text-[16px] font-bold ${inputDisabled ? 'text-gray-400' : ''}`}>%</span>
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <button
                              disabled={acceptDisabled}
                              className={`px-3 h-12 rounded-full text-xs font-semibold ${!acceptDisabled ? 'bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
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
                  // UC0: Any at Initiated: message + Cancel (single-button layout)
                  if (tx.status === 'initiated') {
                    return (
                      <div className="flex items-center gap-2 h-full">
                        <div className="flex-1 px-3 text-[13px] md:text-[14px] font-medium text-gray-800 text-left">
                          This transaction was initiated, but could not be completed
                        </div>
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
                          onClick={() => setShowCancel(true)}
                        >
                          Cancel
                        </button>
                      </div>
                    );
                  }
                  // UC6a: Payer at Paid (paid): message + Cancel (single-button layout)
                  if (tx.myRole === 'payer' && tx.status === 'paid') {
                    return (
                      <div className="flex items-center gap-2 h-full">
                        <div className="flex-1 px-3 text-[13px] md:text-[14px] font-medium text-gray-800 text-left">
                          Waiting for payee to fulfill the purchased item(s)
                        </div>
                        <button
                          className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
                          onClick={() => setShowCancel(true)}
                        >
                          Cancel
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
                              handleAction('released');
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
            </div>
          }
        >
          <div className="space-y-2 text-sm">
            <div className="pt-2">
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold bg-red-100 text-red-700 border border-red-200"
                onClick={() => {
                  setShowReject(false);
                  handleAction('declined');
                }}
              >
                Confirm Reject
              </button>
            </div>
          </div>
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
                onClick={async () => {
                  try {
                    setShowAccept(false);
                    if (!currentUser?.pi_username) {
                      toast.error('Please sign in');
                      return;
                    }
                    const paymentData = {
                      amount: tx.amount,
                      memo: `Escrow payment between ${currentUser.pi_username} and ${tx.counterparty}`,
                      metadata: { orderType: 'send', order_no: id },
                    };
                    await payWithPi(
                      paymentData,
                      () => {
                        setActionBanner('Payment completed successfully');
                        setTimeout(() => setActionBanner(''), 2000);
                        router.push('/history');
                      },
                      () => {
                        toast.error('Payment error');
                      }
                    );
                  } catch (e) {
                    toast.error('Payment error');
                  }
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
