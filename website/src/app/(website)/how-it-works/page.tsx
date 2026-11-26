import React from 'react';
import { HowItWorksSection } from '@/components/web-pages/HowItWorksSection';
import { CollaborationModelsSection } from '@/components/web-pages/CollaborationModelsSection';

export const metadata = {
  title: 'How It Works — Influverse Creator Marketplace',
  description: 'Learn how brands and creators collaborate safely with 100% escrow protection and verified deliverables on Influverse.',
};

export default function HowItWorksPage() {
  return (
    <div>
      <HowItWorksSection />
      <CollaborationModelsSection hideBorderBottom />
    </div>
  );
}
