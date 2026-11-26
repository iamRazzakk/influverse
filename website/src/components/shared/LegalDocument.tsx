import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { serverFetch } from '@/lib/serverFetch';
import type { CmsPage } from '@/types/public';

/**
 * Server component for CMS-managed pages (terms, privacy …) from GET /cms/pages/:slug.
 * The markdown is split on `## ` headings into the same card layout the static pages used.
 * Rendering builds React elements (no raw HTML), so admin-entered content can't inject scripts.
 */

type Section = { id: string; title: string; lines: string[] };

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** `# Title` lines are dropped (the page header shows the title); `## Heading` starts a card. */
const toSections = (markdown: string): Section[] => {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^#\s/.test(line)) continue;
    const heading = line.match(/^#{2,3}\s+(.*)$/);
    if (heading) {
      current = { id: slugify(heading[1]), title: heading[1], lines: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      if (!line.trim()) continue;
      current = { id: 'intro', title: '', lines: [] };
      sections.push(current);
    }
    current.lines.push(line);
  }
  return sections;
};

/** Inline markdown: **bold**, *italic*, [text](https://url). Anything else is plain text. */
const renderInline = (text: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((?:https?:\/\/|mailto:|\/)[^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) parts.push(<strong key={key++} className="font-bold text-[#0A0A0A]">{token.slice(2, -2)}</strong>);
    else if (token.startsWith('*')) parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    else {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/) ?? [];
      parts.push(
        <a key={key++} href={href} className="font-semibold text-[#0A0A0A] underline hover:text-[#FF2D78]">
          {label}
        </a>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
};

/** Groups lines into paragraphs and bullet lists. */
const renderBlocks = (lines: string[]) => {
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push(<p key={blocks.length}>{renderInline(paragraph.join(' '))}</p>);
    if (list.length)
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-1.5 pl-5">
          {list.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
    paragraph = [];
    list = [];
  };
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (!line.trim()) flush();
    else if (bullet) {
      if (paragraph.length) flush();
      list.push(bullet[1]);
    } else {
      if (list.length) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
};

const formatMonth = (iso?: string) =>
  iso ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(iso)) : null;

export async function LegalDocument({ slug, badge, subtitle }: { slug: string; badge: string; subtitle: string }) {
  const page = await serverFetch<CmsPage>(`/cms/pages/${slug}`, { tags: [`cms:page:${slug}`], revalidate: 600 });
  if (!page) notFound();

  const sections = toSections(page.contentMarkdown ?? '');
  const modified = formatMonth(page.updatedAt);

  return (
    <div className="space-y-8 font-sans">
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 min-[380px]:p-6 sm:p-12 border border-[#E7E7E2] shadow-xs space-y-3.5 sm:space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2] text-[11px] sm:text-xs font-bold uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0A0A0A]" />
          <span>{badge}</span>
        </div>
        <h1 className="text-2xl min-[380px]:text-3xl sm:text-4xl font-black text-[#0A0A0A] tracking-tight">{page.title}</h1>
        <p className="text-xs sm:text-base text-[#66665E] font-medium leading-relaxed max-w-2xl">{subtitle}</p>
        {(modified || page.version) && (
          <div className="pt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#66665E]">
            {modified && (
              <>
                <span className="font-semibold text-[#0A0A0A]">Last Modified:</span>
                <span>{modified}</span>
              </>
            )}
            {modified && page.version && <span>•</span>}
            {page.version && <span>Version {page.version}</span>}
          </div>
        )}
      </div>

      <div className="space-y-4 sm:space-y-6">
        {sections.map((section, idx) => (
          <div
            key={`${section.id}-${idx}`}
            id={section.id}
            className="p-4 min-[380px]:p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-white border border-[#E7E7E2] shadow-xs"
          >
            {section.title && (
              <h2 className="mb-3 sm:mb-4 text-lg sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">{section.title}</h2>
            )}
            <div className="space-y-3 text-sm text-[#555550] leading-relaxed font-normal">{renderBlocks(section.lines)}</div>
          </div>
        ))}
      </div>

      <div className="p-6 sm:p-8 rounded-3xl bg-white border border-[#E7E7E2] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-2xl font-extrabold text-[#0A0A0A]">Have questions?</h3>
          <p className="text-sm text-[#66665E]">Check the marketplace FAQ or contact our support team.</p>
        </div>
        <Link
          href="/faq"
          className="w-full sm:w-auto text-center px-5 py-2.5 rounded-full bg-[#0A0A0A] hover:bg-[#FF2D78] text-white font-bold text-xs transition-colors shrink-0"
        >
          View Marketplace FAQ
        </Link>
      </div>
    </div>
  );
}
