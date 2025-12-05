"use client";

import React, { useState } from "react";

interface ConfirmButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick: () => void | Promise<void>;
}

export default function ConfirmButton({
  onClick,
  className = "",
  disabled,
  children,
  ...rest
}: ConfirmButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    if (isSubmitting || disabled) return;
    setIsSubmitting(true);
    try {
      await onClick();
    } finally {
      setIsSubmitting(false);
    }
  };

  const mergedClassName = `${className} disabled:opacity-60 disabled:cursor-not-allowed`;

  return (
    <button
      type="button"
      {...rest}
      className={mergedClassName}
      disabled={disabled || isSubmitting}
      onClick={handleClick}
    >
      {children}
    </button>
  );
}
