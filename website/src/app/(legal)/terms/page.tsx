import type { Metadata } from 'next';
import { LegalDocument } from '@/components/shared/LegalDocument';

export const metadata: Metadata = {
  title: 'Terms of Service — Influverse',
  description: 'Terms governing creator hiring, escrow protection, usage rights and deliverables on Influverse.',
};

/** Content is edited in the dashboard CMS (slug `terms`). */
export default function TermsPage() {
  return (
    <LegalDocument
      slug="terms"
      badge="Marketplace & Escrow Agreement"
      subtitle="Clear, balanced, and transparent terms governing creator hiring, escrow protection, usage rights, and deliverables."
    />
  );
}
