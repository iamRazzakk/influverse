import type { Metadata } from 'next';
import './globals.css';
import { playfairDisplay, redHatDisplay } from './fonts';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { AntdConfig } from '@/components/AntdConfig';
import { OfferModalHost } from '@/components/shared/OfferModalHost';
import { AuthProvider } from '@/lib/session/AuthProvider';
import { LanguageProvider } from '@/lib/i18n/LanguageProvider';
import { OfferModalProvider } from '@/lib/offer/OfferModalProvider';
import { SavedCreatorsProvider } from '@/lib/saved/SavedCreatorsProvider';

export const metadata: Metadata = {
  title: 'Influverse — The Creator Marketplace for Brands & Influencers',
  description:
    'Discover, collaborate, and hire vetted creators across Instagram, TikTok, and YouTube with 100% escrow protection and transparent 15% platform fees in EUR.',
  keywords: [
    'Influencer Marketplace',
    'Content Creators',
    'UGC Ads',
    'Instagram Influencers',
    'TikTok Creators',
    'YouTube Sponsorships',
    'Creator Escrow',
  ],
};

/**
 * Root layout stays static (no cookies read here), so public pages can be cached / ISR.
 * AuthProvider here loads the session in the browser; workspace layouts override it with the
 * server session (see app/(brand-workspace)/layout.tsx).
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`scroll-smooth ${redHatDisplay.variable} ${playfairDisplay.variable}`}>
      <body className="min-h-screen bg-[#FAFAF8] text-[#0A0A0A] antialiased selection:bg-[#FF2D78] selection:text-white font-sans">
        <AntdRegistry>
          <AuthProvider>
            <LanguageProvider>
              <OfferModalProvider>
                <SavedCreatorsProvider>
                  <AntdConfig>
                    {children}
                    <OfferModalHost />
                  </AntdConfig>
                </SavedCreatorsProvider>
              </OfferModalProvider>
            </LanguageProvider>
          </AuthProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
