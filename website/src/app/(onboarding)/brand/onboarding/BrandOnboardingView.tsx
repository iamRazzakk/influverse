'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { http } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { meEndpoints } from '@/lib/api/endpoints/me';
import { profileEndpoints, type BrandProfileUpdate } from '@/lib/api/endpoints/profile';
import { uploadFileWith } from '@/lib/api/endpoints/upload';
import { useAuth } from '@/lib/session/AuthProvider';
import type { BrandProfile, MetaOptions } from '@/types/api';
import { Logo } from '@/components/shared/Logo';
import { CategoryIcon } from '@/components/shared/CategoryIcon';
import {
  BRAND_INDUSTRY_LABELS,
  CAMPAIGN_GOAL_LABELS,
  COUNTRIES,
  CREATOR_TIER_LABELS,
  MONTHLY_BUDGET_LABELS,
  TARGET_PLATFORM_LABELS,
  countryName,
  labelOf,
  normalizePhone,
  normalizeUrl,
} from '@/components/auth/onboardingOptions';
import {
  Building2,
  Camera,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Globe,
  MapPin,
  Mail,
  Phone,
  User as UserIcon,
  Briefcase,
  ShieldCheck,
  Instagram,
  Youtube,
  Video,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { message } from 'antd';
import { RemoteImage } from '@/components/shared/RemoteImage';

const TOTAL_STEPS = 6;

/** Quick-pick niche tags per industry (UI suggestions only — tags are free text on the server). */
const SUGGESTED_TAGS: Record<string, string[]> = {
  beauty: ['Clean Beauty', 'Skincare', 'Organic', 'DTC', 'Vegan', 'Cruelty-Free'],
  fashion: ['Streetwear', 'Sustainable', 'Luxury', 'Accessories', 'DTC', 'Footwear'],
  fitness: ['Supplements', 'Activewear', 'Nutrition', 'Gym', 'Recovery', 'Biohacking'],
  food: ['Plant-Based', 'Gourmet', 'Specialty Coffee', 'Healthy Snacks', 'Beverages'],
  tech: ['SaaS', 'Mobile Apps', 'Gaming', 'AI Tools', 'Consumer Tech'],
  travel: ['Boutique Hotels', 'Eco-Travel', 'Luggage', 'Resorts', 'Airlines'],
  home: ['Smart Home', 'Interior Design', 'Furniture', 'Kitchen', 'Bedding'],
  business: ['Fintech', 'Investing', 'Productivity', 'Consulting'],
  family: ['Baby Gear', 'Maternity', 'Educational Toys', 'Family Lifestyle'],
  eco: ['Zero Waste', 'Renewable', 'Circular Fashion', 'Fair Trade'],
  art: ['Prints', 'Graphic Design', 'Photography', 'Crafts'],
};

/** Visual style per target platform (values come from the server). */
const PLATFORM_STYLE: Record<string, { icon: React.ElementType; color: string }> = {
  instagram: { icon: Instagram, color: 'from-amber-500 via-rose-500 to-purple-600 bg-gradient-to-br' },
  tiktok: { icon: Video, color: 'bg-black text-white' },
  youtube: { icon: Youtube, color: 'bg-[#FF0000] text-white' },
  ugc: { icon: Camera, color: 'bg-[#FF2D78] text-white' },
};

const COMPANY_SIZE_DESC: Record<string, string> = {
  '1-10': 'Startup / Boutique / DTC brand',
  '11-50': 'Growth stage & Scaling e-commerce',
  '51-200': 'Scale-up & Regional brand',
  '201-500': 'Mid-Market enterprise',
  '500+': 'Global corporation / Enterprise',
};

/**
 * Brand onboarding wizard (client). The server page has already checked the session (logged-in brand,
 * onboarding not finished) and loaded the saved profile + dropdown options.
 * Writes are plain API calls: the form keeps its own state, so no server refresh between steps.
 */
export function BrandOnboardingView({
  profile,
  meta,
}: {
  /** Saved brand profile (resume after reload). `null` if it couldn't be loaded. */
  profile: BrandProfile | null;
  /** GET /meta/options. `null` → local fallback option lists. */
  meta: MetaOptions | null;
}) {
  const router = useRouter();
  const { currentUser, reload } = useAuth();

  const updateMe = meEndpoints(http).update;
  const { updateBrand: updateProfile, completeBrandOnboarding: completeOnboarding } = profileEndpoints(http);

  // Stepper: resume where the brand left off (server keeps `onboardingStep`).
  const [step, setStep] = useState<number>(() => Math.min(Math.max(currentUser?.onboardingStep ?? 1, 1), TOTAL_STEPS));
  const totalSteps = TOTAL_STEPS;
  const [isSaving, setIsSaving] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);

  // Step 1: brand identity & representative (email is the login email)
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState(currentUser?.name || '');
  const [jobTitle, setJobTitle] = useState('');
  const email = currentUser?.email || '';
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [logo, setLogo] = useState('');
  const [isLogoUploading, setIsLogoUploading] = useState(false);

  // Step 2: company & headquarters
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [tagline, setTagline] = useState('');

  // Step 3: industry & niche tags
  const [industry, setIndustry] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  // Step 4: channels & campaign goals
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>([]);
  const [campaignGoals, setCampaignGoals] = useState<string[]>([]);

  // Step 5: budget & preferred creator tiers
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);

  // Step 6: VAT, bio, terms
  const [vatNumber, setVatNumber] = useState('');
  const [bio, setBio] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fill the form from the saved profile (resume after reload).
  const prefilled = useRef(false);
  useEffect(() => {
    if (!profile || prefilled.current) return;
    prefilled.current = true;
    setCompanyName(profile.companyName ?? '');
    setJobTitle(profile.jobTitle ?? '');
    setLogo(profile.logo ?? '');
    setWebsite(profile.website ?? '');
    setCountry(profile.country ?? '');
    setCity(profile.city ?? '');
    setCompanySize(profile.companySize ?? '');
    setTagline(profile.tagline ?? '');
    setIndustry(profile.industry ?? '');
    setTags(profile.industryTags ?? []);
    setTargetPlatforms(profile.targetPlatforms ?? []);
    setCampaignGoals(profile.campaignGoals ?? []);
    setMonthlyBudget(profile.monthlyBudget ?? '');
    setSelectedTiers(profile.creatorTiers ?? []);
    setVatNumber(profile.vatNumber ?? '');
    setBio(profile.bio ?? '');
  }, [profile]);

  // Option values come from GET /meta/options (server enums); labels are local.
  const industryOptions = (meta?.brandIndustries ?? Object.keys(BRAND_INDUSTRY_LABELS)).map((id) => ({
    id,
    label: BRAND_INDUSTRY_LABELS[id]?.label ?? labelOf({}, id),
  }));
  const companySizeOptions = (meta?.companySizes ?? Object.keys(COMPANY_SIZE_DESC)).map((value) => ({
    value,
    label: `${value} employees`,
    desc: COMPANY_SIZE_DESC[value] ?? '',
  }));
  const platformOptions = (meta?.targetPlatforms ?? Object.keys(TARGET_PLATFORM_LABELS)).map((id) => ({
    id,
    label: TARGET_PLATFORM_LABELS[id]?.label ?? labelOf({}, id),
    desc: TARGET_PLATFORM_LABELS[id]?.desc ?? '',
    icon: PLATFORM_STYLE[id]?.icon ?? Globe,
    color: PLATFORM_STYLE[id]?.color ?? 'bg-[#0A0A0A] text-white',
  }));
  const goalOptions = (meta?.campaignGoals ?? Object.keys(CAMPAIGN_GOAL_LABELS)).map((id) => ({
    id,
    label: CAMPAIGN_GOAL_LABELS[id]?.label ?? labelOf({}, id),
    desc: CAMPAIGN_GOAL_LABELS[id]?.desc ?? '',
  }));
  const budgetOptions = (meta?.monthlyBudgets ?? Object.keys(MONTHLY_BUDGET_LABELS)).map((id) => ({
    id,
    label: MONTHLY_BUDGET_LABELS[id]?.label ?? labelOf({}, id),
    desc: MONTHLY_BUDGET_LABELS[id]?.desc ?? '',
  }));
  const tierOptions = (meta?.creatorTiers ?? Object.keys(CREATOR_TIER_LABELS)).map((id) => ({
    id,
    label: CREATOR_TIER_LABELS[id]?.label ?? labelOf({}, id),
    range: CREATOR_TIER_LABELS[id]?.range ?? '',
    desc: CREATOR_TIER_LABELS[id]?.desc ?? '',
  }));
  const suggestedTags = SUGGESTED_TAGS[industry] ?? [];
  const industryLabel = industry ? BRAND_INDUSTRY_LABELS[industry]?.label ?? labelOf({}, industry) : 'Industry';

  // Logo: upload to storage, then save the public URL on the brand profile.
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return message.error('Please upload an image file (PNG, JPG, WEBP).');
    if (file.size > 8 * 1024 * 1024) return message.error('Logo file size must be under 8MB.');

    setIsLogoUploading(true);
    try {
      const uploaded = await uploadFileWith(http, file, 'brand_logo');
      if (!uploaded.url) throw new Error('Upload failed');
      await updateProfile({ logo: uploaded.url });
      setLogo(uploaded.url);
      message.success('Brand logo uploaded.');
    } catch (err) {
      message.error(getErrorMessage(err, 'Logo upload failed. Please try again.'));
    } finally {
      setIsLogoUploading(false);
    }
  };

  // Tag toggles (server allows max 8 tags, 30 chars each)
  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      setTags(tags.filter((t) => t !== tag));
    } else {
      if (tags.length >= 8) {
        message.warning('Maximum 8 niche tags.');
        return;
      }
      setTags([...tags, tag]);
    }
  };

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTagInput.trim().slice(0, 30);
    if (!clean) return;
    if (tags.includes(clean)) {
      message.info('Tag already added');
      setNewTagInput('');
      return;
    }
    if (tags.length >= 8) {
      message.warning('Maximum 8 niche tags.');
      return;
    }
    setTags([...tags, clean]);
    setNewTagInput('');
  };

  const toggleIn = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const togglePlatform = (id: string) => toggleIn(targetPlatforms, setTargetPlatforms, id);
  const toggleGoal = (id: string) => toggleIn(campaignGoals, setCampaignGoals, id);
  const toggleTier = (id: string) => toggleIn(selectedTiers, setSelectedTiers, id);

  const stepTitles = [
    'Account & Representative',
    'Company & Headquarters',
    'Industry & Niche Targeting',
    'Channels & Campaign Goals',
    'Creator Budget & Scope',
    'Review & Workspace Launch',
  ];

  /** Saves the current step's fields and moves the server's `onboardingStep` forward. */
  const saveStep = async (current: number) => {
    let patch: BrandProfileUpdate = { onboardingStep: Math.min(current + 1, TOTAL_STEPS) };
    if (current === 1) {
      await updateMe({ name: name.trim(), phone: normalizePhone(phone) || null });
      patch = { ...patch, companyName: companyName.trim(), jobTitle: jobTitle.trim() || null };
    } else if (current === 2) {
      patch = {
        ...patch,
        country,
        city: city.trim(),
        website: normalizeUrl(website) || null,
        tagline: tagline.trim() || null,
        ...(companySize ? { companySize } : {}),
      };
    } else if (current === 3) {
      patch = { ...patch, industry, industryTags: tags };
    } else if (current === 4) {
      patch = { ...patch, targetPlatforms, campaignGoals };
    } else if (current === 5) {
      patch = { ...patch, creatorTiers: selectedTiers, ...(monthlyBudget ? { monthlyBudget } : {}) };
    } else if (current === 6) {
      patch = { ...patch, vatNumber: vatNumber.trim() || null, bio: bio.trim() || null };
    }
    await updateProfile(patch);
  };

  // Validation per step
  const handleNext = async () => {
    if (step === 1) {
      if (!companyName.trim()) return message.error('Please enter your Brand / Company name.');
      if (!name.trim()) return message.error('Please enter your full name.');
    } else if (step === 2) {
      if (!country) return message.error('Please select your headquarters country.');
      if (!city.trim()) return message.error('Please enter your headquarters city.');
    } else if (step === 3) {
      if (!industry) return message.error('Please select your primary industry.');
    } else if (step === 4) {
      if (targetPlatforms.length === 0) return message.warning('Please choose at least 1 platform.');
      if (campaignGoals.length === 0) return message.warning('Please choose at least 1 campaign goal.');
    } else if (step === 5) {
      if (!monthlyBudget) return message.warning('Please select your estimated monthly creator budget.');
    } else if (step === 6) {
      if (!agreeTerms) return message.error('Please accept the Influverse Terms & Escrow Guarantee.');
    }

    setIsSaving(true);
    try {
      await saveStep(step);
      if (step < totalSteps) {
        setStep(step + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        await handleFinalSubmit();
      }
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Final submit: server checks required fields and marks onboarding complete.
  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    try {
      await completeOnboarding();
      // Re-read the session so `onboardingCompleted` is true before entering the workspace.
      await reload();
      message.success(`Brand workspace ready for ${companyName}! Welcome, ${name}.`);
      router.replace('/brand/dashboard');
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col justify-between font-sans selection:bg-[#FF2D78]/20 selection:text-[#FF2D78]">
      {/* Header */}
      <header className="border-b border-[#E7E7E2] bg-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#66665E] bg-[#F4F4F0] px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              <span>Brand Workspace Setup</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
        <div className="w-full max-w-2xl space-y-6">
          {/* Progress Bar & Stepper Indicator */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs sm:text-sm font-bold text-[#FF2D78] flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Step {step} of {totalSteps}</span>
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-[#0A0A0A] tracking-tight">
                  {stepTitles[step - 1]}
                </h1>
              </div>
              <span className="text-xs sm:text-sm font-bold px-3 py-1 rounded-full bg-white border border-[#E7E7E2] text-[#0A0A0A] shadow-xs">
                {Math.round((step / totalSteps) * 100)}% Complete
              </span>
            </div>

            {/* Segmented Step Indicator */}
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: totalSteps }).map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx + 1 < step
                      ? 'bg-[#0A0A0A]'
                      : idx + 1 === step
                      ? 'bg-[#FF2D78]'
                      : 'bg-[#E7E7E2]'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white p-6 sm:p-9 rounded-3xl border border-[#E7E7E2] shadow-xl shadow-black/[0.03] space-y-6">
            {/* STEP 1: ACCOUNT CREDENTIALS & REPRESENTATIVE */}
            {step === 1 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-[#0A0A0A] tracking-tight">
                    Brand & Representative Info
                  </h2>
                  <p className="text-xs sm:text-sm text-[#66665E] font-medium mt-1">
                    Set up your official brand identity and primary team contact details.
                  </p>
                </div>

                {/* Brand Logo Upload */}
                <div className="flex flex-col items-center justify-center text-center py-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="hidden"
                    style={{ display: 'none' }}
                  />
                  <div className="relative group cursor-pointer" onClick={() => logoInputRef.current?.click()}>
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-2 border-dashed border-[#E7E7E2] group-hover:border-[#FF2D78] overflow-hidden bg-[#FAFAF8] flex items-center justify-center transition-all duration-200 shadow-xs">
                      {isLogoUploading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-[#66665E]" />
                      ) : logo ? (
                        <RemoteImage src={logo} alt="Brand Logo" className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-[#66665E] group-hover:text-[#FF2D78]">
                          <Camera className="w-7 h-7" />
                          <span className="text-[11px] font-bold">Upload Logo</span>
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-[#0A0A0A] text-white flex items-center justify-center shadow-md group-hover:bg-[#FF2D78] transition-colors">
                      <Camera className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-xs text-[#66665E] font-medium mt-3">
                    Square PNG, JPG or WEBP up to 8MB (Recommended 400x400)
                  </span>
                </div>

                {/* Brand / Company Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Brand / Company Name <span className="text-[#FF2D78]">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Aura Skincare Paris, Gymshark, Nordic Audio"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:outline-hidden text-sm font-medium text-[#0A0A0A] placeholder:text-[#A3A39C] transition-colors"
                    />
                  </div>
                </div>

                {/* Representative Full Name & Job Title */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                      Your Full Name <span className="text-[#FF2D78]">*</span>
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Elena Rostova"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:outline-hidden text-sm font-medium text-[#0A0A0A] placeholder:text-[#A3A39C] transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                      Job Title / Role
                    </label>
                    <div className="relative">
                      <Briefcase className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder="e.g. Head of Influencer Marketing"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:outline-hidden text-sm font-medium text-[#0A0A0A] placeholder:text-[#A3A39C] transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Work Email & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                      Work Email <span className="text-[#FF2D78]">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                      <input
                        type="email"
                        value={email}
                        readOnly
                        title="Your login email. Change it from account settings."
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E7E7E2] bg-[#FAFAF8] text-sm font-medium text-[#66665E] cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+33 1 42 68 55 00"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:outline-hidden text-sm font-medium text-[#0A0A0A] placeholder:text-[#A3A39C] transition-colors"
                      />
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* STEP 2: COMPANY PROFILE & LOCATION */}
            {step === 2 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-[#0A0A0A] tracking-tight">
                    Company Profile & Headquarters
                  </h2>
                  <p className="text-xs sm:text-sm text-[#66665E] font-medium mt-1">
                    Where is your business headquartered, and what scale is your team?
                  </p>
                </div>

                {/* Website URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Official Website URL
                  </label>
                  <div className="relative">
                    <Globe className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                    <input
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://yourbrand.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:outline-hidden text-sm font-medium text-[#0A0A0A] placeholder:text-[#A3A39C] transition-colors"
                    />
                  </div>
                </div>

                {/* Headquarters Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                      Headquarters Country <span className="text-[#FF2D78]">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full px-4 py-3 pr-10 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:outline-hidden text-sm font-medium text-[#0A0A0A] bg-white appearance-none cursor-pointer transition-colors"
                      >
                        <option value="">Select country...</option>
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-[#66665E] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                      City <span className="text-[#FF2D78]">*</span>
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                      <input
                        type="text"
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. Paris, Berlin, London, New York"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:outline-hidden text-sm font-medium text-[#0A0A0A] placeholder:text-[#A3A39C] transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Company Size */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Company Size
                  </label>
                  <div className="relative">
                    <select
                      value={companySize}
                      onChange={(e) => setCompanySize(e.target.value)}
                      className="w-full px-4 py-3 pr-10 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:outline-hidden text-sm font-medium text-[#0A0A0A] bg-white appearance-none cursor-pointer transition-colors"
                    >
                      <option value="">Select company size...</option>
                      {companySizeOptions.map((size) => (
                        <option key={size.value} value={size.value}>
                          {size.label} ({size.desc})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-[#66665E] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Brand Tagline */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Brand Tagline
                  </label>
                  <input
                    type="text"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="e.g. Clean, organic skincare rituals formulated in Paris."
                    className="w-full px-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:outline-hidden text-sm font-medium text-[#0A0A0A] placeholder:text-[#A3A39C] transition-colors"
                  />
                </div>
              </div>
            )}

            {/* STEP 3: INDUSTRY & NICHE TARGETING */}
            {step === 3 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-[#0A0A0A] tracking-tight">
                    Industry & Niche Targeting
                  </h2>
                  <p className="text-xs sm:text-sm text-[#66665E] font-medium mt-1">
                    Select your primary business vertical so we can match you with relevant creators.
                  </p>
                </div>

                {/* Industry Grid */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Primary Brand Industry <span className="text-[#FF2D78]">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                    {industryOptions.map((ind) => {
                      const isSelected = industry === ind.id;
                      return (
                        <div
                          key={ind.id}
                          onClick={() => {
                            setIndustry(ind.id);
                            // Pre-fill a few suggested tags when none are chosen yet
                            if (tags.length === 0) {
                              setTags((SUGGESTED_TAGS[ind.id] ?? []).slice(0, 4));
                            }
                          }}
                          className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'border-[#FF2D78] bg-[#FFF0F5] shadow-xs'
                              : 'border-[#E7E7E2] hover:border-[#D2D2CA] bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                              isSelected ? 'bg-[#FF2D78] text-white' : 'bg-[#F2F2EE] text-[#0A0A0A]'
                            }`}>
                              <CategoryIcon name={ind.id} size={16} />
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[#0A0A0A]">
                              {ind.label}
                            </span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-[#FF2D78]" />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Niche & Category Tags */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                      Niche Keywords & Attributes ({tags.length}/8)
                    </label>
                    <span className="text-[11px] text-[#66665E] font-medium">Click to toggle</span>
                  </div>

                  {/* Suggested from current industry */}
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set([...suggestedTags, ...tags])).map((tag) => {
                      const isSelected = tags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-[#0A0A0A] text-white shadow-xs'
                              : 'bg-[#F4F4F0] hover:bg-[#E7E7E2] text-[#66665E]'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-[#FF2D78]" />}
                          <span>{tag}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Add Custom Tag Form */}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomTag(e);
                        }
                      }}
                      placeholder="Add custom niche tag (e.g. TikTok Viral, Luxury DTC)..."
                      className="flex-1 px-3.5 py-2 rounded-xl border border-[#E7E7E2] text-xs font-medium text-[#0A0A0A] placeholder:text-[#A3A39C] focus:outline-hidden focus:border-[#0A0A0A]"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTag}
                      className="px-4 py-2 rounded-xl bg-[#F4F4F0] hover:bg-[#E7E7E2] text-xs font-bold text-[#0A0A0A] transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: CHANNELS & CAMPAIGN OBJECTIVES */}
            {step === 4 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-[#0A0A0A] tracking-tight">
                    Channels & Campaign Goals
                  </h2>
                  <p className="text-xs sm:text-sm text-[#66665E] font-medium mt-1">
                    Which platforms do you want to hire creators for, and what are your main KPIs?
                  </p>
                </div>

                {/* Target Platforms */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Platforms You Hire Creators For <span className="text-[#FF2D78]">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {platformOptions.map((plat) => {
                      const isSelected = targetPlatforms.includes(plat.id);
                      const Icon = plat.icon;
                      return (
                        <div
                          key={plat.id}
                          onClick={() => togglePlatform(plat.id)}
                          className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'border-[#0A0A0A] bg-[#FAFAF8] shadow-xs'
                              : 'border-[#E7E7E2] hover:border-[#D2D2CA] bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${plat.color}`}
                              >
                                <Icon className="w-4 h-4 text-white" />
                              </div>
                              <span className="text-sm font-extrabold text-[#0A0A0A]">
                                {plat.label}
                              </span>
                            </div>
                            <div
                              className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                                isSelected
                                  ? 'border-[#0A0A0A] bg-[#0A0A0A] text-white'
                                  : 'border-[#D2D2CA]'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </div>
                          </div>
                          <p className="text-xs text-[#66665E] font-medium leading-relaxed">
                            {plat.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Campaign Objectives */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Primary Campaign Goals <span className="text-[#FF2D78]">*</span>
                  </label>
                  <div className="space-y-2">
                    {goalOptions.map((goal) => {
                      const isSelected = campaignGoals.includes(goal.id);
                      return (
                        <div
                          key={goal.id}
                          onClick={() => toggleGoal(goal.id)}
                          className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'border-[#FF2D78] bg-[#FFF0F5] shadow-xs'
                              : 'border-[#E7E7E2] hover:border-[#D2D2CA] bg-white'
                          }`}
                        >
                          <div>
                            <span className="text-xs sm:text-sm font-bold text-[#0A0A0A] block">
                              {goal.label}
                            </span>
                            <span className="text-[11px] text-[#66665E] font-medium">
                              {goal.desc}
                            </span>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ml-3 ${
                              isSelected
                                ? 'border-[#FF2D78] bg-[#FF2D78] text-white'
                                : 'border-[#D2D2CA]'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: CREATOR BUDGET & SCOPE */}
            {step === 5 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-[#0A0A0A] tracking-tight">
                    Creator Budget & Preferred Tiers
                  </h2>
                  <p className="text-xs sm:text-sm text-[#66665E] font-medium mt-1">
                    Help us calibrate matching creator pricing and recommended packages.
                  </p>
                </div>

                {/* Monthly Budget */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Estimated Monthly Influencer Budget <span className="text-[#FF2D78]">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {budgetOptions.map((b) => {
                      const isSelected = monthlyBudget === b.id;
                      return (
                        <div
                          key={b.id}
                          onClick={() => setMonthlyBudget(b.id)}
                          className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                            isSelected
                              ? 'border-[#0A0A0A] bg-[#FAFAF8] shadow-xs'
                              : 'border-[#E7E7E2] hover:border-[#D2D2CA] bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-black text-[#0A0A0A]">
                              {b.label}
                            </span>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected
                                  ? 'border-[#0A0A0A] bg-[#0A0A0A] text-white'
                                  : 'border-[#D2D2CA]'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5" />}
                            </div>
                          </div>
                          <p className="text-[11px] text-[#66665E] font-medium mt-1">
                            {b.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Preferred Creator Tiers */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Preferred Creator Tiers
                  </label>
                  <div className="space-y-2">
                    {tierOptions.map((tier) => {
                      const isSelected = selectedTiers.includes(tier.id);
                      return (
                        <div
                          key={tier.id}
                          onClick={() => toggleTier(tier.id)}
                          className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'border-[#FF2D78] bg-[#FFF0F5] shadow-xs'
                              : 'border-[#E7E7E2] hover:border-[#D2D2CA] bg-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs sm:text-sm font-bold text-[#0A0A0A]">
                                {tier.label}
                              </span>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white border border-[#E7E7E2] text-[#66665E]">
                                {tier.range}
                              </span>
                            </div>
                            <span className="text-[11px] text-[#66665E] font-medium mt-0.5 block">
                              {tier.desc}
                            </span>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ml-3 ${
                              isSelected
                                ? 'border-[#FF2D78] bg-[#FF2D78] text-white'
                                : 'border-[#D2D2CA]'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: REVIEW, BILLING & WORKSPACE LAUNCH */}
            {step === 6 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-[#0A0A0A] tracking-tight">
                    Review & Workspace Launch
                  </h2>
                  <p className="text-xs sm:text-sm text-[#66665E] font-medium mt-1">
                    Verify your brand profile details before launching your Influverse workspace.
                  </p>
                </div>

                {/* Optional EU VAT / Business Tax ID */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                      EU VAT Number / Business Tax ID
                    </label>
                    <span className="text-[11px] text-[#A3A39C] font-semibold">Optional</span>
                  </div>
                  <input
                    type="text"
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    placeholder="e.g. FR32884920192 or DE994829104"
                    className="w-full px-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:outline-hidden text-sm font-medium text-[#0A0A0A] placeholder:text-[#A3A39C] transition-colors"
                  />
                  <p className="text-[11px] text-[#66665E]">
                    Used for automated B2B reverse charge invoices and official payment receipts in EUR.
                  </p>
                </div>

                {/* Brand Story / Brief for Creators */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Brand Bio & Collaboration Guidelines
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell creators about your brand mission, product aesthetic, and what you look for in creators..."
                    className="w-full px-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:outline-hidden text-sm font-medium text-[#0A0A0A] placeholder:text-[#A3A39C] transition-colors"
                  />
                </div>

                {/* Live Brand Card Preview */}
                <div className="space-y-2 pt-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Public Brand Preview Card
                  </label>
                  <div className="p-4 sm:p-5 rounded-2xl border border-[#E7E7E2] bg-[#FAFAF8] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white border border-[#E7E7E2] shrink-0 shadow-xs flex items-center justify-center">
                        {logo ? (
                          <RemoteImage src={logo} alt={companyName ?? ''} className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
                        ) : (
                          <Building2 className="w-7 h-7 text-[#0A0A0A]" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-base text-[#0A0A0A]">
                            {companyName || 'Your Brand Name'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] text-[10px] font-black">
                            Vetted Brand
                          </span>
                        </div>
                        <div className="text-xs text-[#66665E] font-medium flex items-center gap-2 mt-0.5">
                          <span>{industryLabel}</span>
                          <span>•</span>
                          <span>{[city, countryName(country)].filter(Boolean).join(', ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 sm:justify-end">
                      {tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="px-2.5 py-1 rounded-full bg-white border border-[#E7E7E2] text-[11px] font-bold text-[#0A0A0A]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Terms & Escrow Guarantees */}
                <div className="p-4 rounded-2xl bg-[#FFF0F5] border border-[#FF2D78]/20 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#FF2D78] shrink-0 mt-0.5" />
                  <div className="text-xs text-[#0A0A0A] space-y-1">
                    <span className="font-bold block">100% Escrow & Commercial Protection</span>
                    <p className="text-[#66665E] leading-relaxed">
                      Your campaign funds are held securely in European escrow and only released once creators deliver approved deliverables matching your contract brief.
                    </p>
                  </div>
                </div>

                {/* Agreement Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-[#FF2D78] rounded cursor-pointer"
                  />
                  <span className="text-xs text-[#66665E] leading-relaxed">
                    I agree to the Influverse{' '}
                    <Link href="/terms" className="font-bold text-[#0A0A0A] underline hover:text-[#FF2D78]">
                      Terms of Service
                    </Link>
                    , Commercial Escrow Guidelines, and{' '}
                    <Link href="/privacy" className="font-bold text-[#0A0A0A] underline hover:text-[#FF2D78]">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
              </div>
            )}

            {/* Stepper Footer Controls */}
            <div className="flex items-center justify-between pt-4 border-t border-[#E7E7E2]">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-5 py-2.5 rounded-xl border border-[#E7E7E2] hover:bg-[#F4F4F0] text-sm font-bold text-[#0A0A0A] transition-colors cursor-pointer flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
              ) : (
                <span />
              )}

              <button
                type="button"
                onClick={handleNext}
                disabled={isSubmitting || isSaving}
                className="px-6 py-3 rounded-xl bg-[#0A0A0A] hover:bg-black text-white text-sm font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{step === totalSteps ? (isSubmitting ? 'Launching...' : 'Launch Brand Workspace') : 'Continue'}</span>
                {step < totalSteps && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-[#E7E7E2] bg-white py-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#66665E]">
          <div>© 2026 Influverse Marketplace Inc. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-[#0A0A0A]">Terms</Link>
            <Link href="/privacy" className="hover:text-[#0A0A0A]">Privacy</Link>
            <Link href="/pricing" className="hover:text-[#0A0A0A]">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
