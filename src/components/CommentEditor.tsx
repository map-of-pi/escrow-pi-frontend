"use client";

import React from "react";

interface CommentEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}

export default function CommentEditor({
  value,
  onChange,
  onSubmit,
  disabled,
}: CommentEditorProps) {
  const trimmed = value.trim();

  return (
    <div className="min-h-28">
      <div className="font-semibold mb-2 md:mb-1 text-center">Add New Comment</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        disabled={disabled}
        placeholder={
          disabled
            ? "Adding new comments is closed for this transaction."
            : "Type your comment. You can include contact info or links."
        }
        className={`w-full rounded border p-2 text-xs ${
          disabled ? "bg-gray-100 text-gray-400 cursor-not-allowed" : ""
        }`}
      />
      <div className="mt-2 flex justify-end">
        <button
          disabled={disabled || trimmed.length === 0}
          className={`px-3 py-2 rounded text-xs font-semibold ${
            !disabled && trimmed.length
              ? "bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
          onClick={onSubmit}
        >
          Add Comment
        </button>
      </div>
    </div>
  );
}
