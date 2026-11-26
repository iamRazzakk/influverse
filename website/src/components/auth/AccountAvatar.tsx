'use client';

import React, { useState } from 'react';

/** Account photo / logo with an initials fallback (new accounts have no image yet). */
export function AccountAvatar({
  src,
  name,
  className = 'w-9 h-9 rounded-full',
}: {
  src?: string | null;
  name?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials =
    (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name || 'Account'}
        onError={() => setFailed(true)}
        className={`${className} object-cover border border-[#E7E7E2] shrink-0`}
      />
    );
  }
  return (
    <div
      aria-label={name || 'Account'}
      className={`${className} shrink-0 border border-[#E7E7E2] bg-[#F4F4F0] text-[#0A0A0A] flex items-center justify-center text-xs font-black`}
    >
      {initials}
    </div>
  );
}
