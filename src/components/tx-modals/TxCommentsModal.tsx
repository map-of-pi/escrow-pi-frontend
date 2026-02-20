"use client";

import React from "react";
import Modal from "@/components/Modal";

type Comment = { author: string; text: string; ts: string };

interface TxCommentsModalProps {
  open: boolean;
  onClose: () => void;
  comments: Comment[];
}

export default function TxCommentsModal({
  open,
  onClose,
  comments,
}: TxCommentsModalProps) {
  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
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
                <span className="text-[11px] text-gray-500">
                  {new Date(c.ts).toLocaleString()}
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words text-[13px]">
                {c.text}
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
