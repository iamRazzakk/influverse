'use client';

import React from 'react';
import Link from 'next/link';
import { Users, Home } from 'lucide-react';

/** "Profile Unavailable" screen (404 / not approved yet), unchanged from the old client page. */
export function CreatorUnavailable({ creatorId }: { creatorId: string }) {
  return (
    <div className="bg-[#FAFAF8] min-h-screen py-20 font-sans flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 sm:px-6 text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-[#FFF0F5] text-[#FF2D78] flex items-center justify-center mx-auto shadow-xs">
          <Users className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF0F5] text-[#FF2D78] text-xs font-bold uppercase tracking-wider">
            <span>Creator Not Found</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0A0A0A] tracking-tight">
            Profile Unavailable
          </h1>
          <p className="text-sm text-[#66665E] max-w-sm mx-auto leading-relaxed">
            We couldn’t find a creator matching <span className="font-bold text-[#0A0A0A]">&quot;{creatorId}&quot;</span>. They may have changed their username or made their profile private.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="px-6 py-3 rounded-full bg-[#0A0A0A] hover:bg-[#FF2D78] text-white text-sm font-bold transition-all shadow-xs flex items-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>Browse Creators</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
