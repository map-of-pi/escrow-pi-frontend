"use client";

import { useCallback } from 'react';

type TocItem = {
  id: string;
  label: string;
};

type TocNavProps = {
  items: TocItem[];
};

export default function TocNav({ items }: TocNavProps) {
  const handleClick = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `/developer/developer-guide#${id}`);
      }
    }
  }, []);

  return (
    <nav className="mt-4 space-y-2 text-sm">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => handleClick(item.id)}
          className="w-full rounded-xl px-3 py-2 text-left text-slate-600 transition hover:bg-white hover:text-slate-900"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
