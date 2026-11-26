/**
 * Initial CMS content, copied from the dashboard mock (dashboard/src/lib/constants.ts) so the
 * website shows the same text after it switches to the API. Admins edit it later from the CMS page.
 *
 * NOTE: the legal pages are placeholder text — have them reviewed before going live.
 * Partner brands are intentionally NOT seeded: the mock used real brand names / logos that are not
 * actual partners. Add real partners from the dashboard.
 */

export const SEED_CMS_PAGES = [
  {
    slug: "terms",
    title: "Terms of Service",
    version: "1.0",
    contentMarkdown: `# Terms of Service — Influverse Marketplace

## 1. Introduction and Acceptance
By registering as a Brand or Creator on Influverse, you accept these terms and our 15% platform fee policy.

## 2. Escrow Protection & Platform Fee (15%)
When a Brand funds a collaboration, the creator's price plus a transparent 15% platform fee is held in escrow until the Brand approves the delivered content.

## 3. Creator Obligations & Deliverables
Creators produce original content that follows the campaign brief and agreed delivery dates. Revisions are limited to the number included in the package.

## 4. Brand Usage Rights & Licensing
After escrow is released, the Brand receives the usage rights defined in the purchased package (e.g. 30-day, 90-day or perpetual usage).

## 5. Issues & Support
If something goes wrong with an order, either party can report the issue to Influverse Support. Our team reviews the brief and deliverables and helps both sides reach a fair outcome.`,
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    version: "1.0",
    contentMarkdown: `# Privacy Policy & GDPR Compliance

## 1. Information We Collect
We collect identification, business registration, social media statistics and billing information needed to execute contracts and issue tax-compliant invoices.

## 2. Social Data & Analytics
Creators provide public profile metrics such as follower counts and engagement rates. We never ask for or store social media passwords.

## 3. Payment Processing
Payments are processed by PCI-DSS Level 1 compliant providers (Stripe). We never store raw card numbers.

## 4. Your Rights (GDPR)
You can access, correct, export or delete your personal data at any time by contacting privacy@influverse.com.`,
  },
  {
    slug: "about",
    title: "About Us",
    version: "1.0",
    contentMarkdown: `# About Influverse

## Good Work Starts With The Right Connection
Influverse connects brands with content creators for sponsored collaborations and custom UGC — discovery, offers and delivery in one place.

## Why We Built Influverse
Hiring a creator should be simple: clear package prices, secure escrow payments and one workspace for briefs, files and feedback.

## Core Guarantees
- Escrow protection on every collaboration
- Creators keep 100% of their package price
- Transparent 15% platform fee paid by the brand`,
  },
] as const;

export const SEED_FAQS = [
  {
    category: "brands",
    question: "How does the Influverse escrow system protect my budget?",
    answer:
      "When you send an offer, the campaign budget (creator price + 15% platform fee) is held in escrow. The creator only gets paid after you review and approve the submitted content.",
  },
  {
    category: "brands",
    question: "What is the difference between UGC Content and a Sponsored Post?",
    answer:
      "UGC is custom photo/video content the creator makes for you to post on your own channels or ads. A Sponsored Post is published by the creator on their own Instagram, TikTok or YouTube.",
  },
  {
    category: "brands",
    question: "Why is Influverse different from traditional influencer agencies?",
    answer:
      "No middleman markups or slow email chains: you see each creator's packages and prices, pay into escrow, and manage briefs, files and feedback in one workspace.",
  },
  {
    category: "brands",
    question: "How do revisions work if I need changes on the content?",
    answer:
      "Each package includes a set number of revision rounds. When the creator delivers, you can request changes from the order page before approving.",
  },
  {
    category: "brands",
    question: "What payment methods and invoices are supported?",
    answer:
      "All prices are in EUR. You can pay by card, SEPA transfer or Apple / Google Pay, and download VAT invoices with your company details.",
  },
  {
    category: "creators",
    question: "Do creators have to pay any fee or commission?",
    answer: "No. Creators keep 100% of their package price. The 15% platform fee is paid by the brand.",
  },
  {
    category: "creators",
    question: "When and how do creators receive their payouts?",
    answer:
      "When the brand approves your delivery (or automatically a few days after delivery), the payment is released to your connected Stripe account and paid out to your bank.",
  },
  {
    category: "creators",
    question: "Are all creators verified on Influverse?",
    answer:
      "Every creator profile is reviewed by our team before it goes public. Creators can additionally apply for the verified badge by proving their channel statistics.",
  },
  {
    category: "creators",
    question: "What happens if a brand requests changes outside the agreed package?",
    answer:
      "Extra work beyond the package needs a new custom offer. If you can't agree, report the issue from the order page and Influverse Support will help.",
  },
  {
    category: "creators",
    question: "Who owns the rights to the content I create?",
    answer:
      "Brands get the usage rights listed in the package. You keep authorship and may show approved work in your portfolio unless the brand requires confidentiality.",
  },
] as const;

export const SEED_SITE_SETTINGS = {
  heroHeadline: "Where Brands Discover & Hire Top Creators",
  heroSubtitle: "The creator marketplace with escrow protection and transparent EUR pricing.",
  supportEmail: "support@influverse.com",
  socialLinks: [
    { platform: "instagram", url: "https://instagram.com/influverse" },
    { platform: "linkedin", url: "https://linkedin.com/company/influverse" },
  ],
  ticker: {
    headline: "TRUSTED BY LEADING BRANDS & CREATOR AGENCIES",
    speedSeconds: 26,
    pauseOnHover: true,
    direction: "left",
    isEnabled: true,
  },
};
