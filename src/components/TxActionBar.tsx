"use client";

import React from "react";
import { TxItem, TxStatus, fmt, deriveBreakdown, statusLabel } from "@/lib";

interface TxActionBarProps {
  tx: TxItem;
  disputeStatus: 'none' | 'proposed' | 'accepted' | 'declined' | 'cancelled';
  refundPercent: number;
  refundPercentStr: string;
  onRefundInputChange: (value: string) => void;
  onRefundInputBlur: () => void;
  lastProposedPercent: number | null;
  lastProposedBy: 'payer' | 'payee' | null;
  lastProposedByUsername: string | null;
  acceptedByUsername: string | null;
  actionBanner: string;
  setActionBanner: (msg: string) => void;
  showDispute: boolean;
  setShowDispute: (v: boolean) => void;
  showCancel: boolean;
  setShowCancel: (v: boolean) => void;
  showFulfilled: boolean;
  setShowFulfilled: (v: boolean) => void;
  showReceived: boolean;
  setShowReceived: (v: boolean) => void;
  showSendProposal: boolean;
  setShowSendProposal: (v: boolean) => void;
  showAcceptProposal: boolean;
  setShowAcceptProposal: (v: boolean) => void;
  showReject: boolean;
  setShowReject: (v: boolean) => void;
  showAccept: boolean;
  setShowAccept: (v: boolean) => void;
  handleAction: (newStatus: TxStatus) => Promise<void> | void;
}

export default function TxActionBar({
  tx,
  disputeStatus,
  refundPercent,
  refundPercentStr,
  onRefundInputChange,
  onRefundInputBlur,
  lastProposedPercent,
  lastProposedBy,
  lastProposedByUsername,
  acceptedByUsername,
  actionBanner,
  setActionBanner,
  setShowDispute,
  setShowCancel,
  setShowFulfilled,
  setShowReceived,
  setShowSendProposal,
  setShowAcceptProposal,
  setShowReject,
  setShowAccept,
  handleAction,
}: TxActionBarProps) {
  const isTerminal =
    tx.status === "cancelled" || tx.status === "declined" || tx.status === "released";

  return (
    <>
      {/* UC2: Success banner */}
      {actionBanner && (
        <div className="fixed top-[90px] left-0 right-0 z-40 px-4">
          <div className="max-w-md mx-auto rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 text-sm text-center">
            {actionBanner}
          </div>
        </div>
      )}

      {/* UC1/UC2: Action section (varies by status/role) - fixed to bottom */}
      <div
        className="fixed inset-x-0 z-10 px-4 bg-[var(--default-bg-color)]"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="w-full max-w-md mx-auto">
          <div className="font-semibold mb-2 text-center">Action</div>
          {/* Single Action shell; height depends on status (larger for disputed only) */}
          <div
            className={`w-full rounded-2xl p-2 bg-[#f5efe2] border border-[#2e6f4f] ${
              tx.status === "disputed" ? "min-h-[120px]" : "h-[72px]"
            }`}
          >
            {(() => {
              if (isTerminal) {
                return (
                  <div className="flex items-center justify-center text-center px-3 text-[13px] md:text-[14px] font-medium text-gray-800 h-full leading-tight overflow-hidden">
                    {tx.status === "declined" ? (
                      <div>
                        <div className="text-red-700">This transaction was declined</div>
                        <div>No further actions required.</div>
                      </div>
                    ) : tx.status === "cancelled" ? (
                      <div>
                        <div>This transaction was cancelled.</div>
                        <div>No further actions required.</div>
                      </div>
                    ) : tx.status === "disputed" ? (
                      <div>
                        <div className="text-red-700">
                          This transaction is marked as disputed.
                        </div>
                        <div>No further actions required.</div>
                      </div>
                    ) : tx.status === "released" ? (
                      <div>
                        <div className="text-green-700">
                          This transaction is marked as Completed.
                        </div>
                        <div>No further actions required.</div>
                      </div>
                    ) : (
                      <div>No further actions required.</div>
                    )}
                  </div>
                );
              }

              // UC9: Both roles at Disputed
              if (tx.status === "disputed") {
                const isAccepted = disputeStatus === "accepted";
                const hasProposal =
                  lastProposedPercent !== null && disputeStatus !== "none";
                const hasCounterpartyProposal =
                  hasProposal && lastProposedBy !== tx.myRole;
                const matchesProposal =
                  hasCounterpartyProposal &&
                  Math.abs(refundPercent - (lastProposedPercent ?? 0)) < 1e-9;
                const inputDisabled =
                  isAccepted || (hasProposal && lastProposedBy === tx.myRole);
                const sendDisabled =
                  isAccepted ||
                  matchesProposal ||
                  (hasProposal && lastProposedBy === tx.myRole);
                const acceptDisabled = isAccepted || !matchesProposal;

                return (
                  <div className="h-full flex flex-col">
                    <div
                      className="text-center text-[12px] font-semibold rounded-md px-2 py-1 mb-1"
                      style={{
                        background: "var(--default-primary-color)",
                        color: "var(--default-secondary-color)",
                      }}
                    >
                      Dispute Centre
                    </div>
                    <div className="text-center text-[11px] text-gray-700 mb-1">
                      {isAccepted ? (
                        <>
                          Accepted proposal:{" "}
                          <span className="font-semibold">
                            {lastProposedPercent ?? 0}%
                          </span>
                          {lastProposedByUsername ? (
                            <>
                              {" "}— Proposed by:{" "}
                              <span className="font-semibold">
                                {lastProposedByUsername}
                              </span>
                            </>
                          ) : null}
                          {acceptedByUsername ? (
                            <>
                              {" "}& Accepted by:{" "}
                              <span className="font-semibold">
                                {acceptedByUsername}
                              </span>
                            </>
                          ) : null}
                        </>
                      ) : hasProposal && lastProposedPercent !== null ? (
                        <>
                          Current proposal:{" "}
                          <span className="font-semibold">
                            {lastProposedPercent}%
                          </span>
                          {lastProposedByUsername ? (
                            <>
                              {" "}by{" "}
                              <span className="font-semibold">
                                {lastProposedByUsername}
                              </span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <>
                          Current proposal:{" "}
                          <span className="font-semibold">None</span>
                        </>
                      )}
                    </div>
                    <div className="flex-1 grid grid-cols-3 items-center gap-2">
                      <div className="flex justify-start">
                        <button
                          disabled={sendDisabled}
                          className={`px-3 h-12 rounded-full text-xs font-semibold ${
                            !sendDisabled
                              ? "bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
                              : "bg-gray-200 text-gray-500 cursor-not-allowed"
                          }`}
                          onClick={() => setShowSendProposal(true)}
                        >
                          <span className="flex flex-col leading-tight items-center">
                            <span>Send</span>
                            <span>Proposal</span>
                          </span>
                        </button>
                      </div>
                      <div className="flex flex-col items-center justify-center text-[11px] text-gray-700">
                        <div className="text-[11px] text-gray-800 leading-tight">
                          Propose refund
                        </div>
                        <div className="text-[10px] text-gray-600">(0-100%)</div>
                        <div className="flex items-baseline justify-center mt-0.5">
                          <input
                            type="text"
                            inputMode="decimal"
                            className={`w-16 text-center bg-transparent border-0 outline-none text-[20px] font-bold ${
                              inputDisabled ? "text-gray-400 cursor-not-allowed" : ""
                            }`}
                            value={refundPercentStr}
                            disabled={inputDisabled}
                            onChange={(e) => {
                              if (inputDisabled) return;
                              onRefundInputChange(e.target.value);
                            }}
                            onBlur={() => {
                              if (inputDisabled) return;
                              onRefundInputBlur();
                            }}
                          />
                          <span
                            className={`ml-1 text-[16px] font-bold ${
                              inputDisabled ? "text-gray-400" : ""
                            }`}
                          >
                            %
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          disabled={acceptDisabled}
                          className={`px-3 h-12 rounded-full text-xs font-semibold ${
                            !acceptDisabled
                              ? "bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
                              : "bg-gray-200 text-gray-500 cursor-not-allowed"
                          }`}
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

              if (tx.myRole === "payer" && tx.status === "requested") {
                return (
                  <div className="flex items-center gap-2 h-full">
                    <button
                      className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[#f0b37e] border border-[#d9b07a] hover:brightness-110 active:brightness-105 transition"
                      onClick={() => setShowReject(true)}
                    >
                      Reject
                    </button>
                    <div className="flex-1 text-center px-3 text-[13px] md:text-[14px] font-medium text-gray-800">
                      Waiting for Payer to accept Payee request for pi transfer
                    </div>
                    <button
                      className="px-4 h-12 rounded-full text-sm font-semibold bg-[var(--default-primary-color)] text-[#f0b37e] border border-[#d9b07a] hover:brightness-110 active:brightness-105 transition"
                      onClick={() => setShowAccept(true)}
                    >
                      Accept
                    </button>
                  </div>
                );
              }

              if (tx.myRole === "payee" && tx.status === "requested") {
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

              if (tx.myRole === "payee" && tx.status === "paid") {
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

              if (tx.myRole === "payee" && tx.status === "fulfilled") {
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

              if (tx.status === "initiated") {
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

              if (tx.myRole === "payer" && tx.status === "paid") {
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

              if (tx.myRole === "payer" && tx.status === "fulfilled") {
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

              return (
                <div className="flex items-center gap-2 h-full">
                  {tx.myRole === "payee" ? (
                    <>
                      <div className="flex-1" />
                    </>
                  ) : (
                    <>
                      <div className="flex-1" />
                      <button
                        disabled={tx.status !== "fulfilled"}
                        className={`px-4 h-12 rounded-full text-sm font-semibold ${
                          tx.status === "fulfilled"
                            ? "bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
                            : "bg-gray-200 text-gray-500 cursor-not-allowed"
                        }`}
                        onClick={() => {
                          if (tx.status !== "fulfilled") return;
                          handleAction("released");
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
    </>
  );
}
