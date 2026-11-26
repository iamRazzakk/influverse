import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { tryPublic } from '@/lib/api/server';
import { publicEndpoints } from '@/lib/api/endpoints/public';

/** Footer settings are public + cached (tag `cms:site`), so these pages stay static. */
export default async function WebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const site = await tryPublic((api) => publicEndpoints(api).siteSettings());
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="min-w-0 w-full flex-1">{children}</main>
      <Footer site={site} />
    </div>
  );
}
