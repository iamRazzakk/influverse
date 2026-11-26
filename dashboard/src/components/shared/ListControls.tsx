import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Pill-style status tabs, same look as the Verifications page filter. */
export const FilterTabs = <T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: FilterTab<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) => (
  <div className={cn('flex flex-wrap items-center gap-1.5 bg-neutral-100 p-1 rounded-xl self-start', className)}>
    {tabs.map((tab) => (
      <button
        key={tab.value}
        type="button"
        onClick={() => onChange(tab.value)}
        className={cn(
          'px-3.5 py-2 text-sm font-bold rounded-lg transition-all capitalize cursor-pointer flex items-center gap-1.5',
          value === tab.value ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-600 hover:text-neutral-950'
        )}
      >
        <span>{tab.label}</span>
        {tab.count !== undefined && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-200/80 text-neutral-700">{tab.count}</span>
        )}
      </button>
    ))}
  </div>
);

/**
 * Search box that only searches when the admin presses Enter. These endpoints match exact codes
 * (ORD-10001, TKT-…), so searching on every keystroke would just flash "no results".
 * `value` is the applied search; the box keeps its own draft until submitted.
 */
export const SubmitSearch: React.FC<{
  value: string;
  onSubmit: (value: string) => void;
  placeholder: string;
  /** Returns an error message when the draft can't be sent (e.g. too short) */
  validate?: (value: string) => string | null;
  className?: string;
}> = ({ value, onSubmit, placeholder, validate, className }) => {
  const [draft, setDraft] = useState(value);
  const [hint, setHint] = useState('');

  // Keep the box in sync when the applied search changes from outside (deep link, tab switch).
  useEffect(() => setDraft(value), [value]);

  const submit = () => {
    const trimmed = draft.trim();
    const error = trimmed ? validate?.(trimmed) ?? (trimmed.length < 2 ? 'Type at least 2 characters.' : null) : null;
    setHint(error ?? '');
    if (!error) onSubmit(trimmed);
  };

  const clear = () => {
    setDraft('');
    setHint('');
    onSubmit('');
  };

  return (
    <div className={cn('relative sm:w-72', className)}>
      <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') clear();
        }}
        className="w-full h-9 pl-9 pr-8 text-xs bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink text-neutral-900 placeholder:text-neutral-400 font-medium"
      />
      {(draft || value) && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5"
          title="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {hint ? (
        <p className="absolute left-0 top-full mt-1 text-[11px] font-semibold text-rose-600">{hint}</p>
      ) : (
        draft.trim() !== value && draft.trim() && (
          <p className="absolute left-0 top-full mt-1 text-[11px] font-semibold text-neutral-400">Press Enter to search</p>
        )
      )}
    </div>
  );
};

/** Small label → value row used inside the detail modals. */
export const DetailRow: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={cn('flex items-center justify-between gap-3 text-xs', className)}>
    <span className="text-neutral-500 font-medium shrink-0">{label}</span>
    <span className="font-bold text-neutral-950 text-right min-w-0 break-words">{children}</span>
  </div>
);

/** Red dismissible banner for failed actions (same style as the Verifications page). */
export const ErrorBanner: React.FC<{ message: string; onDismiss: () => void }> = ({ message, onDismiss }) =>
  message ? (
    <div className="p-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between gap-3">
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="p-0.5 shrink-0" title="Dismiss">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  ) : null;
