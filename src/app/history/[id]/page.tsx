"use client";
import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import TxHeaderCard from '@/components/TxHeaderCard';
import TxDetailsBreakdown from '@/components/TxDetailsBreakdown';
import AuditLogPreview from '@/components/AuditLogPreview';
import CommentEditor from '@/components/CommentEditor';
import TxActionBar from '@/components/TxActionBar';
import TxDisputeConfirmModal from '@/components/tx-modals/TxDisputeConfirmModal';
import TxCancelInitiatedModal from '@/components/tx-modals/TxCancelInitiatedModal';
import TxCancelPaidModal from '@/components/tx-modals/TxCancelPaidModal';
import TxReceivedModal from '@/components/tx-modals/TxReceivedModal';
import TxFulfilledModal from '@/components/tx-modals/TxFulfilledModal';
import TxCancelRequestModal from '@/components/tx-modals/TxCancelRequestModal';
import TxRejectRequestModal from '@/components/tx-modals/TxRejectRequestModal';
import TxAcceptRequestModal from '@/components/tx-modals/TxAcceptRequestModal';
import TxCommentsModal from '@/components/tx-modals/TxCommentsModal';
import TxSendProposalModal from '@/components/tx-modals/TxSendProposalModal';
import TxAcceptProposalModal from '@/components/tx-modals/TxAcceptProposalModal';
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
      <TxDisputeConfirmModal
        tx={tx}
        open={showDispute}
        onClose={() => setShowDispute(false)}
        onConfirm={() => handleAction('disputed')}
      />

      {/* UC0: Cancel popup (any transactions at initiated) */}
      <TxCancelInitiatedModal
        tx={tx}
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={() => {
          setShowCancel(false);
          handleAction('cancelled');
        }}
      />

      {/* UC6a: Cancel popup (payer at paid) */}
      <TxCancelPaidModal
        tx={tx}
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={() => {
          setShowCancel(false);
          handleAction('cancelled');
        }}
      />

      {/* UC9: Send Proposal popup (payer/payee at disputed) */}
      <TxSendProposalModal
        tx={tx}
        open={showSendProposal}
        onClose={() => setShowSendProposal(false)}
        refundPercent={refundPercent}
        refundPercentStr={refundPercentStr}
        onConfirm={async () => {
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
      />

      {/* Accept Proposal popup (payer/payee at disputed) */}
      <TxAcceptProposalModal
        tx={tx}
        open={showAcceptProposal}
        onClose={() => setShowAcceptProposal(false)}
        lastProposedPercent={lastProposedPercent}
        refundPercent={refundPercent}
        onConfirm={async () => {
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
      />

      {/* UC7: Received popup (payer at fulfilled) */}
      <TxReceivedModal
        tx={tx}
        open={showReceived}
        onClose={() => setShowReceived(false)}
        onConfirm={() => {
          setShowReceived(false);
          handleAction('released');
        }}
      />

      {/* UC5: Fulfilled popup (payee at paid) */}
      <TxFulfilledModal
        tx={tx}
        open={showFulfilled}
        onClose={() => setShowFulfilled(false)}
        onConfirm={() => {
          setShowFulfilled(false);
          handleAction('fulfilled');
        }}
      />

      {/* UC3: Cancel popup (payee at requested) */}
      <TxCancelRequestModal
        tx={tx}
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={() => {
          setShowCancel(false);
          handleAction('cancelled');
        }}
      />
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

      <TxActionBar
        tx={tx}
        disputeStatus={disputeStatus}
        refundPercent={refundPercent}
        refundPercentStr={refundPercentStr}
        lastProposedPercent={lastProposedPercent}
        lastProposedBy={lastProposedBy}
        lastProposedByUsername={lastProposedByUsername}
        acceptedByUsername={acceptedByUsername}
        actionBanner={actionBanner}
        setActionBanner={setActionBanner}
        showDispute={showDispute}
        setShowDispute={setShowDispute}
        showCancel={showCancel}
        setShowCancel={setShowCancel}
        showFulfilled={showFulfilled}
        setShowFulfilled={setShowFulfilled}
        showReceived={showReceived}
        setShowReceived={setShowReceived}
        showSendProposal={showSendProposal}
        setShowSendProposal={setShowSendProposal}
        showAcceptProposal={showAcceptProposal}
        setShowAcceptProposal={setShowAcceptProposal}
        showReject={showReject}
        setShowReject={setShowReject}
        showAccept={showAccept}
        setShowAccept={setShowAccept}
        handleAction={handleAction}
      />

      {/* UC2: Success banner */}
      {actionBanner && (
        <div className="fixed top-[90px] left-0 right-0 z-40 px-4">
          <div className="max-w-md mx-auto rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 text-sm text-center">
            {actionBanner}
          </div>
        </div>
      )}

      {/* UC2: Reject popup (payer at requested) */}
      <TxRejectRequestModal
        tx={tx}
        open={showReject}
        onClose={() => setShowReject(false)}
        onConfirm={() => {
          setShowReject(false);
          handleAction('declined');
        }}
      />

      {/* UC2: Accept popup (payer at requested) */}
      <TxAcceptRequestModal
        tx={tx}
        open={showAccept}
        onClose={() => setShowAccept(false)}
        onConfirm={async () => {
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
      />

      {/* Full-screen reader for all comments */}
      <TxCommentsModal
        open={showComments}
        onClose={() => setShowComments(false)}
        comments={comments}
      />
    </div>
  );
}
