'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { Instagram, Youtube, Linkedin, Facebook } from 'lucide-react';
import type { SiteSettings } from '@/types/public';

type SocialPlatform = NonNullable<SiteSettings['socialLinks']>[number]['platform'];

const TIKTOK_ICON = (
  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
  </svg>
);
const X_ICON = (
  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

/** Icon + hover colour per CMS social platform. */
const SOCIAL_STYLES: Record<SocialPlatform, { label: string; icon: React.ReactNode; hover: string }> = {
  instagram: { label: 'Instagram', icon: <Instagram className="w-4.5 h-4.5" />, hover: 'hover:bg-[#E1306C] hover:text-white' },
  tiktok: { label: 'TikTok', icon: TIKTOK_ICON, hover: 'hover:bg-white hover:text-black' },
  youtube: { label: 'YouTube', icon: <Youtube className="w-4.5 h-4.5" />, hover: 'hover:bg-[#FF0000] hover:text-white' },
  x: { label: 'X (Twitter)', icon: X_ICON, hover: 'hover:bg-white hover:text-black' },
  linkedin: { label: 'LinkedIn', icon: <Linkedin className="w-4.5 h-4.5" />, hover: 'hover:bg-[#0A66C2] hover:text-white' },
  facebook: { label: 'Facebook', icon: <Facebook className="w-4.5 h-4.5" />, hover: 'hover:bg-[#1877F2] hover:text-white' },
};

/** `site` is fetched (cached, tag `cms:site`) by the server layout that renders the footer. */
export function Footer({ site }: { site?: SiteSettings | null }) {
  const pathname = usePathname();
  const { t } = useLang();
  const tf = t.footer;
  const socialLinks = (site?.socialLinks ?? []).filter((l) => l.url);
  return (
    <footer className="bg-[#0A0A0A] text-[#FAFAF8] pt-16 sm:pt-20 pb-12 sm:pb-16 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-8 mb-12 sm:mb-16">
          {/* Brand Col */}
          <div className="lg:col-span-2">
            <Logo isLight size="md" />
            <p className="text-sm text-[#C4C4BC] max-w-sm leading-relaxed mt-2.5">
              {tf.about}
            </p>

            {/* Social links are managed in the dashboard CMS (GET /cms/site). Hidden when none are set. */}
            {socialLinks.length > 0 && (
              <div className="flex items-center gap-3 pt-5">
                {socialLinks.map((link) => {
                  const style = SOCIAL_STYLES[link.platform];
                  if (!style) return null;
                  return (
                    <a
                      key={link.platform}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={style.label}
                      className={`w-10 h-10 rounded-full bg-white/5 text-[#C4C4BC] flex items-center justify-center transition-all duration-300 border border-white/10 hover:border-transparent hover:scale-110 shadow-sm ${style.hover}`}
                    >
                      {style.icon}
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-7 lg:col-span-3 lg:grid-cols-3 lg:gap-8">
          {/* Column: Discover */}
          <div className="min-w-0 space-y-3 lg:space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#A3A39C]">
              {tf.discover}
            </h4>
            <ul className="space-y-2 text-sm leading-snug text-[#D4D4CA]">
              <li>
                <Link href="/creators" className="hover:text-white transition-colors">
                  {tf.allCreators}
                </Link>
              </li>
              <li>
                <Link href="/creators?category=beauty" className="hover:text-white transition-colors">
                  {tf.beauty}
                </Link>
              </li>
              <li>
                <Link href="/creators?category=travel" className="hover:text-white transition-colors">
                  {tf.travel}
                </Link>
              </li>
              <li>
                <Link href="/creators?category=fitness" className="hover:text-white transition-colors">
                  {tf.fitness}
                </Link>
              </li>
              <li>
                <Link href="/creators?category=tech" className="hover:text-white transition-colors">
                  {tf.tech}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column: Platform */}
          <div className="min-w-0 space-y-3 lg:space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#A3A39C]">
              {tf.platform}
            </h4>
            <ul className="space-y-2 text-sm leading-snug text-[#D4D4CA]">
              <li>
                <Link href="/about" className="hover:text-white transition-colors flex items-center gap-1.5">
                  {tf.aboutInfluverse}
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="hover:text-white transition-colors">
                  {tf.howItWorks}
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-white transition-colors">
                  {tf.pricing}
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-white transition-colors">
                  {tf.faq}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column: Company & Legal */}
          <div className="min-w-0 space-y-3 lg:space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#A3A39C]">
              {tf.legal}
            </h4>
            <ul className="space-y-2 text-sm leading-snug text-[#D4D4CA]">
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  {tf.aboutUs}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  {tf.terms}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  {tf.privacy}
                </Link>
              </li>
              <li>
                <Link href="/terms#guidelines" className="hover:text-white transition-colors">
                  {tf.guidelines}
                </Link>
              </li>
            </ul>
          </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 sm:pt-8 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-[#A3A39C]">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span>© {new Date().getFullYear()} Influverse Inc. {tf.rights}</span>
            <span className="hidden sm:inline">•</span>
            <span className="text-[#D4D4CA]">{tf.motto}</span>
          </div>

          <div className="flex items-center gap-6">
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
}
