"use client";

import React from "react";
import Modal from "@/components/Modal";
import ConfirmButton from "@/components/ConfirmButton";
import { TxItem } from "@/lib";

interface TxRejectRequestModalProps {
  tx: TxItem;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function TxRejectRequestModal({
  tx,
  open,
  onClose,
  onConfirm,
}: TxRejectRequestModalProps) {
  if (!(tx.myRole === "payer" && tx.status === "requested")) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="text-center space-y-1">
          <div className="font-semibold">
            Confirm you reject the request to pay pi
          </div>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <div className="pt-2">
          <ConfirmButton
            className="w-full py-2 rounded-lg text-sm font-semibold bg-red-100 text-red-700 border border-red-200"
            onClick={onConfirm}
          >
            Confirm Reject
          </ConfirmButton>
        </div>
      </div>
    </Modal>
  );
}
