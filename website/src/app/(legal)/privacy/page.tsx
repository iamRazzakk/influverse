import type { Metadata } from 'next';
import { LegalDocument } from '@/components/shared/LegalDocument';

export const metadata: Metadata = {
  title: 'Privacy Policy — Influverse',
  description: 'How Influverse collects, uses and protects personal data (GDPR).',
};

/** Content is edited in the dashboard CMS (slug `privacy`). */
export default function PrivacyPage() {
  return (
    <LegalDocument
      slug="privacy"
      badge="GDPR & Data Protection"
      subtitle="What data we collect, why we need it, and the rights you have over it."
    />
  );
}
