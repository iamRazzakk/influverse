'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/session/AuthProvider';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import {
  Building2,
  Shield,
  Globe,
  MapPin,
  Mail,
  Save,
  ExternalLink,
  X,
  User,
  Phone,
  Briefcase,
  Plus,
  Check,
  Camera,
  Loader2,
} from 'lucide-react';
import { ShareProfileModal } from '@/components/shared/ShareProfileModal';
import { CategoryIcon } from '@/components/shared/CategoryIcon';
import { Input, Select, message } from 'antd';
import {
  ChangePasswordCard,
  DeactivationCard,
  NotificationPrefsCard,
  SessionsCard,
} from '@/components/auth/AccountSettingsCards';
import {
  BRAND_INDUSTRY_LABELS,
  COUNTRIES,
  countryName,
  labelOf,
  normalizePhone,
  normalizeUrl,
} from '@/components/auth/onboardingOptions';
import { http } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { meEndpoints } from '@/lib/api/endpoints/me';
import { profileEndpoints, type BrandProfileUpdate } from '@/lib/api/endpoints/profile';
import { uploadFileWith, type UploadContext } from '@/lib/api/endpoints/upload';
import type { SessionInfo } from '@/lib/api/endpoints/auth';
import { useMutation } from '@/lib/hooks/useMutation';
import type { BrandProfile, MetaOptions } from '@/types/api';
import { RemoteImage } from '@/components/shared/RemoteImage';

/** Quick-pick niche tags per industry (UI suggestions only). */
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

const COMPANY_SIZE_LABELS: Record<string, string> = {
  '1-10': '1 - 10 employees (Startup / Boutique)',
  '11-50': '11 - 50 employees (Growth stage)',
  '51-200': '51 - 200 employees (Scale-up)',
  '201-500': '201 - 500 employees (Mid-Market)',
  '500+': '500+ employees (Enterprise / Global)',
};

interface SettingsViewProps {
  /** GET /me/brand-profile (null = failed → "Could not load" with retry). */
  profile: BrandProfile | null;
  /** GET /meta/options (null = failed → local fallback lists). */
  meta: MetaOptions | null;
  /** GET /auth/sessions (null = failed → the card shows Retry). */
  sessions: SessionInfo[] | null;
}

export function SettingsView({ profile, meta, sessions }: SettingsViewProps) {
  const router = useRouter();
  const { currentUser, reload } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data comes from the server page: no loading phase; retry = re-render the server page.
  const isProfileLoading = false;
  const isError = !profile;
  const refetch = () => router.refresh();
  // Writes skip router.refresh(); reload() (after saving) re-reads /me and refreshes the server data.
  const { run: updateMe, loading: isSavingUser } = useMutation(
    (body: Parameters<ReturnType<typeof meEndpoints>['update']>[0]) => meEndpoints(http).update(body),
    { refresh: false },
  );
  const { run: updateProfile, loading: isSavingProfile } = useMutation(
    (body: BrandProfileUpdate) => profileEndpoints(http).updateBrand(body),
    { refresh: false },
  );
  const uploadFile = (file: File, context: UploadContext) => uploadFileWith(http, file, context);

  const [activeTab, setActiveTab] = useState<'company' | 'security'>('company');

  // Company profile form (filled from the server once loaded)
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState(currentUser?.name || '');
  const email = currentUser?.email || '';
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [avatar, setAvatar] = useState('');
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [companySize, setCompanySize] = useState<string | undefined>(undefined);
  const [industry, setIndustry] = useState<string | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [bio, setBio] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setCompanyName(profile.companyName ?? '');
    setAvatar(profile.logo ?? '');
    setWebsite(profile.website ?? '');
    setCountry(profile.country ?? '');
    setCity(profile.city ?? '');
    setCompanySize(profile.companySize);
    setIndustry(profile.industry);
    setTags(profile.industryTags ?? []);
    setBio(profile.bio ?? '');
  }, [profile]);

  // Dropdown values from GET /meta/options; labels are local.
  const industryOptions = (meta?.brandIndustries ?? Object.keys(BRAND_INDUSTRY_LABELS)).map((id) => ({
    value: id,
    label: BRAND_INDUSTRY_LABELS[id]?.label ?? labelOf({}, id),
  }));
  const companySizeOptions = (meta?.companySizes ?? Object.keys(COMPANY_SIZE_LABELS)).map((value) => ({
    value,
    label: COMPANY_SIZE_LABELS[value] ?? `${value} employees`,
  }));
  const suggestedTags = industry ? SUGGESTED_TAGS[industry] ?? [] : [];
  const industryLabel = industry ? BRAND_INDUSTRY_LABELS[industry]?.label ?? labelOf({}, industry) : '';
  const isSaving = isSavingUser || isSavingProfile;

  // Logo: upload → save the URL on the brand profile right away.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return message.error('Please upload an image file.');
    if (file.size > 8 * 1024 * 1024) return message.error('Logo image size must be less than 8MB');

    setIsLogoUploading(true);
    try {
      const uploaded = await uploadFile(file, 'brand_logo');
      if (!uploaded.url) throw new Error('Upload failed');
      await updateProfile({ logo: uploaded.url });
      await reload();
      setAvatar(uploaded.url);
      message.success('Brand logo updated!');
    } catch (err) {
      message.error(getErrorMessage(err, 'Logo upload failed. Please try again.'));
    } finally {
      setIsLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await updateProfile({ logo: null });
      await reload();
      setAvatar('');
      message.success('Logo removed');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !contactName.trim()) {
      message.error('Brand name and contact name are required.');
      return;
    }
    if (!country || !city.trim()) {
      message.error('Country and city are required.');
      return;
    }

    try {
      // Contact person lives on the account (PATCH /me); company fields on the brand profile.
      await updateMe({ name: contactName.trim(), phone: normalizePhone(phone) || null });
      await updateProfile({
        companyName: companyName.trim(),
        website: normalizeUrl(website) || null,
        country,
        city: city.trim(),
        ...(companySize ? { companySize } : {}),
        ...(industry ? { industry } : {}),
        industryTags: tags,
        bio: bio.trim() || null,
      });
      await reload();
      message.success('Brand profile saved!');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  if (isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#A3A39B]" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-[#66665E]">
        <span>Could not load your brand profile.</span>
        <button type="button" onClick={() => refetch()} className="font-bold text-[#0A0A0A] underline cursor-pointer">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader
        title="Settings"
        subtitle="Brand profile, marketplace identity, and account security."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Navigation Tabs */}
        <div className="bg-white rounded-lg p-1 border border-[#E7E7E2] flex items-center gap-1 shadow-2xs w-fit max-w-full overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('company')}
            className={`h-10 px-4 sm:px-5 rounded-md font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'company'
                ? 'bg-[#0A0A0A] text-white shadow-xs'
                : 'text-[#66665E] hover:text-[#0A0A0A] hover:bg-[#FAFAF8]'
            }`}
          >
            <Building2 className={`w-4 h-4 shrink-0 ${activeTab === 'company' ? 'text-white' : 'text-[#66665E]'}`} />
            <span className="whitespace-nowrap">Company Profile</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`h-10 px-4 sm:px-5 rounded-md font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'bg-[#0A0A0A] text-white shadow-xs'
                : 'text-[#66665E] hover:text-[#0A0A0A] hover:bg-[#FAFAF8]'
            }`}
          >
            <Shield className={`w-4 h-4 shrink-0 ${activeTab === 'security' ? 'text-white' : 'text-[#66665E]'}`} />
            <span className="whitespace-nowrap">Security</span>
          </button>
        </div>

        {/* TAB 1: COMPANY PROFILE */}
        {activeTab === 'company' && (
          <form onSubmit={handleSaveCompany} className="space-y-6">
            <div className="bg-white rounded-xl p-4 sm:p-6 lg:p-8 border border-[#E7E7E2] shadow-2xs space-y-6">
              {/* Header with Verification Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E7E7E2]">
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                    Brand Identity & Organization
                  </h2>
                  <p className="text-sm text-[#66665E] mt-0.5">
                    Public company details, industry focus, and marketplace profile shown to creators.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0 flex-wrap">
                  <Link
                    href={`/brands/${profile.slug}`}
                    target="_blank"
                    className="inline-flex h-10 items-center gap-1.5 px-3.5 rounded-lg bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] text-xs font-bold text-[#0A0A0A] transition-all shadow-2xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#66665E]" />
                    <span>View Public Profile</span>
                  </Link>
                </div>
              </div>

              {/* Brand Logo (Centered, Matching Onboarding Standards) */}
              <div className="flex flex-col items-center justify-center text-center py-2 pb-6 border-b border-[#E7E7E2]">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />

                {isLogoUploading ? (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-dashed border-[#D2D2CA] bg-[#FAFAF8] flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#66665E]" />
                  </div>
                ) : avatar ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-[#0A0A0A] shadow-md cursor-pointer group transition-transform hover:scale-105"
                  >
                    <RemoteImage src={avatar} alt={companyName ?? ''} className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
                    <div className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 mb-1 text-white" />
                      <span className="text-xs font-bold">Change</span>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-dashed border-[#D2D2CA] hover:border-[#0A0A0A] bg-[#FAFAF8] hover:bg-[#F4F4F0] flex flex-col items-center justify-center cursor-pointer transition-all text-[#66665E] hover:text-[#0A0A0A] group hover:scale-105"
                  >
                    <Camera className="w-7 h-7 sm:w-8 sm:h-8 mb-1 text-[#0A0A0A] group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">Upload</span>
                  </div>
                )}

                <div className="mt-3 space-y-0.5 text-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm font-bold text-[#0A0A0A] hover:text-[#FF2D78] transition-colors cursor-pointer block mx-auto"
                  >
                    {avatar ? 'Click logo to change' : 'Click to upload brand logo'}
                  </button>
                  <div className="text-xs text-[#66665E]">
                    JPG, PNG, or WEBP up to 8MB
                  </div>
                  {avatar && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline transition-colors cursor-pointer pt-1 inline-block"
                    >
                      Remove logo
                    </button>
                  )}
                </div>
              </div>

              {/* Brand & Organization Details Section */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-[#0A0A0A] tracking-tight">
                    Brand & Organization Details
                  </h3>
                  <p className="text-xs sm:text-sm text-[#66665E] mt-0.5">
                    General information, contact credentials, and marketplace discovery settings.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  {/* Brand Name */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-[#0A0A0A]">
                      Brand Name <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      prefix={<Building2 className="w-4 h-4 text-[#A3A39C] mr-0.5" />}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="rounded-lg h-11 text-base sm:text-sm font-medium text-[#0A0A0A] border-[#E7E7E2] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
                      placeholder="e.g. Aura Skincare Paris"
                      required
                    />
                  </div>

                  {/* Account Manager / Contact Name */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-[#0A0A0A]">
                      Partnerships Lead <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      prefix={<User className="w-4 h-4 text-[#A3A39C] mr-0.5" />}
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="rounded-lg h-11 text-base sm:text-sm font-medium text-[#0A0A0A] border-[#E7E7E2] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
                      placeholder="e.g. Elena Rostova"
                      required
                    />
                  </div>

                  {/* Primary Industry */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-[#0A0A0A]">
                      Primary Industry <span className="text-rose-500">*</span>
                    </label>
                    <Select
                      value={industry}
                      placeholder="Select industry"
                      onChange={(val: string) => {
                        setIndustry(val);
                        if (tags.length === 0) setTags((SUGGESTED_TAGS[val] ?? []).slice(0, 3));
                      }}
                      className="w-full h-11 rounded-lg"
                      options={industryOptions.map((ind) => ({
                        value: ind.value,
                        label: (
                          <div className="flex items-center gap-2">
                            <CategoryIcon name={ind.value} size={15} className="text-[#0A0A0A] shrink-0" />
                            <span className="font-semibold text-sm">{ind.label}</span>
                          </div>
                        ),
                      }))}
                    />
                  </div>

                  {/* Business Email */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-[#0A0A0A]">
                      Login Email
                    </label>
                    <Input
                      prefix={<Mail className="w-4 h-4 text-[#A3A39C] mr-0.5" />}
                      type="email"
                      value={email}
                      readOnly
                      disabled
                      className="rounded-lg h-11 text-base sm:text-sm font-medium text-[#0A0A0A] border-[#E7E7E2]"
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-[#0A0A0A]">
                      Phone Number
                    </label>
                    <Input
                      prefix={<Phone className="w-4 h-4 text-[#A3A39C] mr-0.5" />}
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="rounded-lg h-11 text-base sm:text-sm font-medium text-[#0A0A0A] border-[#E7E7E2] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
                      placeholder="+33 1 42 68 55 00"
                    />
                  </div>

                  {/* Official Website */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-[#0A0A0A]">
                      Official Website
                    </label>
                    <Input
                      prefix={<Globe className="w-4 h-4 text-[#A3A39C] mr-0.5" />}
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="rounded-lg h-11 text-base sm:text-sm font-medium text-[#0A0A0A] border-[#E7E7E2] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
                      placeholder="https://aura-skincare.com"
                    />
                  </div>

                  {/* Company Size */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-[#0A0A0A]">Company Size</label>
                    <Select
                      value={companySize}
                      placeholder="Select company size"
                      onChange={(val: string) => setCompanySize(val)}
                      className="w-full h-11 rounded-lg"
                      options={companySizeOptions}
                    />
                  </div>

                  {/* Country */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-[#0A0A0A]">
                      Country <span className="text-rose-500">*</span>
                    </label>
                    <Select
                      value={country || undefined}
                      placeholder="Select country"
                      showSearch
                      optionFilterProp="label"
                      onChange={(val: string) => setCountry(val)}
                      className="w-full h-11 rounded-lg"
                      options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
                    />
                  </div>

                  {/* City / Headquarters */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-[#0A0A0A]">
                      City / Headquarters <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      prefix={<MapPin className="w-4 h-4 text-[#A3A39C] mr-0.5" />}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="rounded-lg h-11 text-base sm:text-sm font-medium text-[#0A0A0A] border-[#E7E7E2] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
                      placeholder="e.g. Paris, Berlin, London"
                    />
                  </div>

                  {/* About Brand / Bio (with character counter) */}
                  <div className="space-y-1.5 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-bold text-[#0A0A0A]">
                        Bio / About Brand
                      </label>
                      <span className="text-xs font-semibold text-[#66665E]">
                        {bio.length}/2000
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      maxLength={2000}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full rounded-lg border border-[#E7E7E2] hover:border-[#0A0A0A] focus:border-[#0A0A0A] focus:outline-none p-3.5 text-base sm:text-sm font-normal text-[#0A0A0A] leading-relaxed transition-all resize-y shadow-2xs"
                      placeholder="Tell creators what your brand stands for, your campaign goals, and what makes your products unique..."
                    />
                  </div>
                </div>
              </div>

              {/* Marketplace Niche Tags */}
              <div className="pt-6 border-t border-[#E7E7E2] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[#0A0A0A] tracking-tight flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-[#0A0A0A]" />
                      <span>Marketplace Niche Tags</span>
                    </h3>
                    <p className="text-xs text-[#66665E] mt-0.5">
                      Helps creators discover relevant campaign briefs and match collaboration styles.
                    </p>
                  </div>
                  <span className="text-xs text-[#66665E] font-medium">
                    {tags.length}/8 tags selected
                  </span>
                </div>

                {/* Active Selected Tags */}
                <div className="min-h-[46px] rounded-lg border border-[#E7E7E2] hover:border-[#0A0A0A] focus-within:border-[#0A0A0A] bg-white p-2 flex flex-wrap items-center gap-1.5 transition-all shadow-2xs">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 rounded-md bg-[#FAFAF8] border border-[#E7E7E2] text-sm font-semibold text-[#0A0A0A]"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => setTags(tags.filter((t) => t !== tag))}
                        className="text-[#66665E] hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}

                  <input
                    type="text"
                    placeholder={tags.length === 0 ? "Type tag and press Enter..." : "+ Add custom tag"}
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        const trimmed = newTagInput.trim().replace(/^#/, '').slice(0, 30);
                        if (trimmed && !tags.includes(trimmed) && tags.length < 8) {
                          setTags([...tags, trimmed]);
                          setNewTagInput('');
                        }
                      }
                    }}
                    className="outline-none text-base sm:text-xs bg-transparent min-w-[120px] flex-1 text-[#0A0A0A] placeholder:text-[#66665E] px-1 py-0.5 font-medium"
                  />
                </div>

                {/* Suggested Quick Tags for Selected Industry */}
                {suggestedTags.length > 0 && (
                  <div className="pt-1.5">
                    <span className="text-xs font-semibold text-[#66665E] mr-2">
                      Suggested for {industryLabel}:
                    </span>
                    <div className="inline-flex flex-wrap items-center gap-1.5 mt-1">
                      {suggestedTags.map((sug) => {
                        const isSelected = tags.includes(sug);
                        return (
                          <button
                            key={sug}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setTags(tags.filter((t) => t !== sug));
                              } else if (tags.length < 8) {
                                setTags([...tags, sug]);
                              }
                            }}
                            className={`text-xs px-2.5 py-1 rounded-md border transition-all cursor-pointer flex items-center gap-1 ${
                              isSelected
                                ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]'
                                : 'bg-white hover:bg-[#FAFAF8] text-[#52524E] border-[#E7E7E2]'
                            }`}
                          >
                            <span>#{sug}</span>
                            {isSelected ? (
                              <Check className="w-3 h-3 text-white" />
                            ) : (
                              <Plus className="w-3 h-3 text-[#66665E]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>


              {/* Bottom Save Action */}
              <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-xs text-[#66665E] font-medium">
                  Changes to brand identity and industry tags update across your active campaigns immediately.
                </p>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="disabled:opacity-60 w-full sm:w-auto h-11 px-8 rounded-lg font-bold text-sm bg-[#0A0A0A] hover:bg-zinc-800 text-white transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shrink-0"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save Brand Profile</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* TAB 2: SECURITY & PASSWORD */}
        {activeTab === 'security' && (
          <div className="space-y-6 sm:space-y-8">
            <ChangePasswordCard />
            <SessionsCard sessions={sessions} />
            <NotificationPrefsCard />
            <DeactivationCard accountLabel="Brand Account" />
          </div>
        )}
      </div>

      {/* Share Brand Profile Modal */}
      <ShareProfileModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={companyName}
        subtitle={[industryLabel, [city, countryName(country)].filter(Boolean).join(', ')].filter(Boolean).join(' • ')}
        description={bio}
        link={website}
        shareUrl={`/brands/${profile.slug}`}
        avatar={avatar}
        role="brand"
      />
    </div>
  );
}
