import React from 'react';
import { FaqSection } from '@/components/web-pages/FaqSection';
import { serverFetch } from '@/lib/serverFetch';
import type { CmsFaq } from '@/types/public';

export const metadata = {
  title: 'FAQ — Influverse Creator Marketplace',
  description: 'Frequently asked questions regarding Influverse creator bookings, escrow deposits, and deliverables.',
};

/** FAQs from the dashboard CMS (GET /cms/faqs), refreshed by the `cms:faqs` revalidate tag. */
export default async function FaqPage() {
  const faqs = (await serverFetch<CmsFaq[]>('/cms/faqs', { tags: ['cms:faqs'] })) ?? [];

  return (
    <div className="flex flex-col min-h-screen bg-[#FAFAF8]">
      <FaqSection faqs={faqs} isFullPage={true} showViewAll={false} />
    </div>
  );
}
