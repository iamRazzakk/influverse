import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { tryPublic } from '@/lib/api/server';
import { publicEndpoints } from '@/lib/api/endpoints/public';

export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const site = await tryPublic((api) => publicEndpoints(api).siteSettings());
  return (
    <div className="flex flex-col min-h-screen bg-[#FAFAF8]">
      <Navbar />
      <main className="flex-1 py-12 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {children}
      </main>
      <Footer site={site} />
    </div>
  );
}
