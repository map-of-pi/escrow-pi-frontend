"use client";

import React from "react";

type Comment = { author: string; text: string; ts: string };

interface AuditLogPreviewProps {
  comments: Comment[];
  offsetPx: number;
  previewContainerRef: React.RefObject<HTMLDivElement>;
  previewContentRef: React.RefObject<HTMLDivElement>;
  onOpen: () => void;
}

export default function AuditLogPreview({
  comments,
  offsetPx,
  previewContainerRef,
  previewContentRef,
  onOpen,
}: AuditLogPreviewProps) {
  return (
    <div className="min-h-28" aria-label="Open all comments">
      <div className="font-semibold mb-2 md:mb-1 text-center">Audit Log</div>
      <div
        ref={previewContainerRef}
        className={`rounded-lg border p-3 md:p-2 bg-white h-40 overflow-hidden cursor-pointer hover:bg-gray-50 flex flex-col justify-start`}
        onClick={onOpen}
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
                  <span className="text-[11px] text-gray-500">
                    {new Date(c.ts).toLocaleString()}
                  </span>
                </div>
                <div className="whitespace-pre-wrap break-words text-[13px]">{c.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
