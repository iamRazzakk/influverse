'use client';

import React, { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/session/AuthProvider';
import { http } from '@/lib/api/client';
import { useMutation } from '@/lib/hooks/useMutation';
import { useRequest } from '@/lib/hooks/useRequest';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { ShareProfileModal } from '@/components/shared/ShareProfileModal';
import { ImageUpload } from '@/components/shared/ImageUpload';
import { InstagramLogo, TikTokLogo, YouTubeLogo } from '@/components/shared/SocialLogos';
import { CategoryIcon } from '@/components/shared/CategoryIcon';
import { meEndpoints } from '@/lib/api/endpoints/me';
import { profileEndpoints } from '@/lib/api/endpoints/profile';
import {
  GALLERY_CATEGORIES,
  GALLERY_LIMIT,
  studioEndpoints,
  type GalleryCategory,
  type GalleryPhoto,
  type VerificationApplyInput,
  type VerificationRequest,
} from '@/lib/api/endpoints/studio';
import { uploadFileWith } from '@/lib/api/endpoints/upload';
import { formatCents } from '@/lib/format';
import { getErrorMessage } from '@/lib/api/errors';
import type { CreatorProfile, SocialPlatform } from '@/types/api';
import {
  User,
  Globe,
  Save,
  MapPin,
  Upload,
  X,
  Check,
  AlertCircle,
  Image as ImageIcon,
  Plus,
  Trash2,
  Edit3,
  MoreVertical,
  ExternalLink,
  Languages,
  Link2,
  Unlink,
  Camera,
  Loader2,
  ShieldCheck,
  Clock,
  Share2,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { Input, InputNumber, Button, message, Select, Dropdown, Modal, Image } from 'antd';
import { Button as AppButton } from '@/components/ui';
import { RemoteImage } from '@/components/shared/RemoteImage';

// Server enum values (creator.constant.ts) with display labels.
const CATEGORIES = [
  { id: 'beauty', label: 'Beauty & Skincare' },
  { id: 'fashion', label: 'Fashion & Style' },
  { id: 'fitness', label: 'Fitness & Health' },
  { id: 'travel', label: 'Travel & Adventure' },
  { id: 'food', label: 'Food & Cuisine' },
  { id: 'lifestyle', label: 'Lifestyle & Wellness' },
  { id: 'tech', label: 'Tech & Gaming' },
  { id: 'business', label: 'Business & Finance' },
  { id: 'art', label: 'Art & Photography' },
  { id: 'family', label: 'Family & Parenting' },
];

const COLLABORATION_PREFERENCES = [
  { id: 'sponsored', label: 'Sponsored Posts', desc: 'Dedicated reels, videos, and posts' },
  { id: 'ugc', label: 'UGC Content', desc: 'Ad content without posting to your feed' },
  { id: 'reviews', label: 'Product Reviews', desc: 'Unboxings and honest product reviews' },
  { id: 'events', label: 'Events & Brand Trips', desc: 'In-person events and brand trips' },
  { id: 'ambassador', label: 'Brand Ambassadorship', desc: 'Long-term brand partnerships' },
  { id: 'affiliate', label: 'Affiliate & Gifting', desc: 'Affiliate links and product gifting' },
];

/** Server stores ISO-2 country codes. */
const COUNTRIES = [
  { code: 'CH', name: 'Switzerland' },
  { code: 'DE', name: 'Germany' },
  { code: 'AT', name: 'Austria' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'SE', name: 'Sweden' },
  { code: 'US', name: 'United States' },
];

const COMMON_LANGUAGES = [
  'English', 'German', 'French', 'Spanish', 'Italian', 'Dutch', 'Portuguese', 'Swedish',
  'Polish', 'Turkish', 'Arabic', 'Hindi', 'Bengali', 'Japanese', 'Korean', 'Chinese',
];

const HANDLE_REGEX = /^[a-z0-9_.]{3,30}$/;

const PLATFORMS: { id: SocialPlatform; label: string; logo: React.ReactNode; urlPrefix: string }[] = [
  { id: 'instagram', label: 'Instagram', logo: <InstagramLogo className="w-8 h-8 rounded-lg shadow-2xs shrink-0" />, urlPrefix: 'https://instagram.com/' },
  { id: 'tiktok', label: 'TikTok', logo: <TikTokLogo className="w-8 h-8 rounded-lg shadow-2xs shrink-0" />, urlPrefix: 'https://tiktok.com/@' },
  { id: 'youtube', label: 'YouTube', logo: <YouTubeLogo className="w-8 h-8 rounded-lg shadow-2xs shrink-0" />, urlPrefix: 'https://youtube.com/@' },
];

type Tab = 'identity' | 'gallery' | 'channels' | 'verification';

const tabButton = (active: boolean) =>
  `py-2.5 px-4 sm:px-5 rounded-md font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
    active ? 'bg-[#0A0A0A] text-white shadow-xs' : 'text-[#66665E] hover:text-[#0A0A0A] hover:bg-[#FAFAF8]'
  }`;

const card = 'bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs';
const fieldInput = 'rounded-lg h-11 text-base sm:text-sm font-medium text-[#0A0A0A]';

const formatFollowers = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

/** Small debounce so the handle check doesn't fire on every keystroke. */
function useDebounced<T>(value: T, ms = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ===========================================================================
// Tab 1 — basic info (PATCH /me for name/avatar, PATCH /me/creator-profile for the rest)
// ===========================================================================
function IdentityTab({ profile }: { profile: CreatorProfile }) {
  const { currentUser, reload } = useAuth();
  // No refresh here: `reload()` after saving re-reads the session (sidebar name/avatar) and refreshes the page.
  const updateMeMutation = useMutation(meEndpoints(http).update, { refresh: false });
  const updateProfileMutation = useMutation(profileEndpoints(http).updateCreator, { refresh: false });
  const savingAccount = updateMeMutation.loading;
  const savingProfile = updateProfileMutation.loading;
  const uploadFile = (file: File, context: 'avatar') => uploadFileWith(http, file, context);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(currentUser?.name ?? '');
  const [avatar, setAvatar] = useState(currentUser?.avatar ?? '');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverImage, setCoverImage] = useState(profile.coverImage ?? '');
  const [handle, setHandle] = useState(profile.handle ?? '');
  const [gender, setGender] = useState<string | undefined>(profile.gender);
  const [country, setCountry] = useState<string | undefined>(profile.country);
  const [city, setCity] = useState(profile.city ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [languages, setLanguages] = useState<string[]>(profile.languages ?? []);
  const [categories, setCategories] = useState<string[]>(profile.categories ?? []);
  const [tags, setTags] = useState<string[]>(profile.tags ?? []);
  const [newTagInput, setNewTagInput] = useState('');
  const [collabPreferences, setCollabPreferences] = useState<string[]>(profile.collaborationPreferences ?? []);

  // Handle availability (only checked when it changed and has a valid format)
  const cleanHandle = handle.replace(/^@+/, '').trim().toLowerCase();
  const handleChanged = cleanHandle !== (profile.handle ?? '');
  const handleValidFormat = HANDLE_REGEX.test(cleanHandle);
  const debouncedHandle = useDebounced(cleanHandle);
  const { data: handleCheck, loading: checkingHandle } = useRequest(
    (signal) => profileEndpoints(http).checkHandle(debouncedHandle, signal),
    [debouncedHandle],
    { skip: !handleChanged || !HANDLE_REGEX.test(debouncedHandle) },
  );
  const handleTaken = handleChanged && handleCheck?.handle === cleanHandle && !handleCheck.available;
  const handleAvailable = handleChanged && handleCheck?.handle === cleanHandle && handleCheck.available;

  const handleAvatarPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    try {
      const uploaded = await uploadFile(file, 'avatar');
      if (uploaded.url) setAvatar(uploaded.url);
    } catch (err) {
      message.error(getErrorMessage(err, 'Upload failed. Please try again.'));
    } finally {
      setAvatarUploading(false);
    }
  };

  const toggleCategory = (id: string) => {
    if (categories.includes(id)) {
      if (categories.length === 1) return void message.warning('Please keep at least 1 category');
      setCategories(categories.filter((c) => c !== id));
    } else {
      if (categories.length >= 3) return void message.warning('You can select up to 3 categories');
      setCategories([...categories, id]);
    }
  };

  const togglePreference = (id: string) => {
    if (collabPreferences.includes(id)) {
      if (collabPreferences.length === 1) return void message.warning('Please keep at least 1 collaboration preference');
      setCollabPreferences(collabPreferences.filter((p) => p !== id));
    } else {
      setCollabPreferences([...collabPreferences, id]);
    }
  };

  const addTag = (val: string) => {
    const items = val.split(',').map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    setTags(Array.from(new Set([...tags, ...items])).slice(0, 15));
    setNewTagInput('');
  };

  const handleSave = async () => {
    if (!name.trim()) return void message.error('Name is required.');
    if (!handleValidFormat) return void message.error('Username: 3–30 characters, only a-z, 0-9, _ and .');
    if (handleTaken) return void message.error(`@${cleanHandle} is already taken.`);
    if (!languages.length) return void message.error('Please add at least 1 language.');

    try {
      // Account fields live on the user; only send them when they changed.
      if (name.trim() !== currentUser?.name || (avatar || null) !== (currentUser?.avatar || null)) {
        await updateMeMutation.run({ name: name.trim(), avatar: avatar || null });
      }
      await updateProfileMutation.run({
        ...(handleChanged && { handle: cleanHandle }),
        bio: bio.trim(),
        coverImage: coverImage || null,
        ...(gender && { gender }),
        ...(country && { country }),
        ...(city.trim() && { city: city.trim() }),
        languages,
        ...(categories.length && { categories }),
        tags,
        ...(collabPreferences.length && { collaborationPreferences: collabPreferences }),
      });
      await reload();
      message.success('Profile saved');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const saving = savingAccount || savingProfile;

  return (
    <div className="space-y-6">
      <div className={`${card} space-y-7`}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Profile Details</h2>
          <AppButton size="md" className="!rounded-lg shrink-0" variant="primary" onClick={() => void handleSave()} icon={<Save className="w-4 h-4" />} disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </AppButton>
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-5 py-2 pb-6 border-b border-[#E7E7E2]">
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPicked} />
          <div
            onClick={() => !avatarUploading && avatarInputRef.current?.click()}
            className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-[#0A0A0A] shadow-md cursor-pointer group shrink-0 bg-[#FAFAF8] flex items-center justify-center"
          >
            {avatar ? (
              <RemoteImage src={avatar} alt={name ?? ''} className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
            ) : (
              <Camera className="w-6 h-6 text-[#0A0A0A]" />
            )}
            <div className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-bold">Change</span>
            </div>
            {avatarUploading && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
          </div>
          <div className="space-y-0.5 text-left">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="text-sm font-bold text-[#0A0A0A] hover:text-[#FF2D78] transition-colors cursor-pointer block"
            >
              {avatar ? 'Click photo to change' : 'Click to upload photo'}
            </button>
            <div className="text-xs text-[#66665E]">JPG, PNG, or WEBP up to 10MB</div>
            {avatar && (
              <button type="button" onClick={() => setAvatar('')} className="text-xs font-semibold text-rose-600 hover:underline pt-0.5 block">
                Remove photo
              </button>
            )}
          </div>
        </div>

        {/* Cover */}
        <ImageUpload
          variant="banner"
          context="cover"
          label="Cover Image"
          description="Shown at the top of your public profile. PNG, JPG, WEBP up to 15MB"
          maxSizeMb={15}
          value={coverImage}
          onChange={setCoverImage}
        />

        {/* Public details */}
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-[#0A0A0A] tracking-tight">Public Details</h3>
            <p className="text-xs sm:text-sm text-[#66665E] mt-0.5">Displayed on your public marketplace profile.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-[#0A0A0A]">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <Input
                prefix={<User className="w-4 h-4 text-[#A3A39C] mr-0.5" />}
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                className={fieldInput}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-[#0A0A0A]">Gender</label>
              <Select
                value={gender}
                onChange={setGender}
                placeholder="Select"
                className="w-full h-11 rounded-lg [&_.ant-select-selector]:!rounded-lg"
                options={[
                  { value: 'female', label: 'Female' },
                  { value: 'male', label: 'Male' },
                  { value: 'other', label: 'Other' },
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-[#0A0A0A]">
                  Username <span className="text-rose-500">*</span>
                </label>
                {handleChanged && cleanHandle && (
                  !handleValidFormat ? (
                    <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Invalid format
                    </span>
                  ) : checkingHandle || handleCheck?.handle !== cleanHandle ? (
                    <span className="text-xs font-bold text-[#66665E] flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking
                    </span>
                  ) : handleTaken ? (
                    <span className="text-xs font-bold text-rose-500 flex items-center gap-1">
                      <X className="w-3.5 h-3.5" /> Unavailable
                    </span>
                  ) : handleAvailable ? (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Available
                    </span>
                  ) : null
                )}
              </div>
              <Input
                prefix={<span className="text-[#66665E] text-sm font-medium mr-0.5">@</span>}
                value={handle}
                maxLength={30}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                className={`${fieldInput} ${handleTaken ? '!border-rose-400' : ''}`}
                placeholder="yourname"
              />
            </div>

            {/* Starting rate is computed by the server from your cheapest active package. */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-[#0A0A0A]">Starting Rate</label>
              <div className="h-11 px-3.5 rounded-lg border border-[#E7E7E2] bg-[#FAFAF8] flex items-center justify-between text-sm">
                <span className="font-bold text-[#0A0A0A]">
                  {profile.startingPriceCents ? formatCents(profile.startingPriceCents) : '—'}
                </span>
                <a href="/creator/packages" className="text-xs font-bold text-[#66665E] hover:text-[#0A0A0A]">
                  From your packages →
                </a>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-[#0A0A0A]">Country</label>
              <Select
                value={country}
                onChange={setCountry}
                placeholder="Select country"
                showSearch
                optionFilterProp="label"
                className="w-full h-11 rounded-lg [&_.ant-select-selector]:!rounded-lg"
                options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-[#0A0A0A]">City</label>
              <Input
                prefix={<MapPin className="w-4 h-4 text-[#A3A39C] mr-0.5" />}
                value={city}
                maxLength={100}
                onChange={(e) => setCity(e.target.value)}
                className={fieldInput}
                placeholder="Zurich, Paris, London"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-[#0A0A0A]">Bio</label>
                <span className="text-xs font-semibold text-[#66665E]">{bio.length}/1000</span>
              </div>
              <textarea
                rows={3}
                maxLength={1000}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell brands what you create and what makes your content unique..."
                className="w-full rounded-lg border border-[#E7E7E2] hover:border-[#0A0A0A] focus:border-[#0A0A0A] focus:outline-none p-3.5 text-base sm:text-sm text-[#0A0A0A] leading-relaxed transition-all resize-y shadow-2xs"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-sm font-bold text-[#0A0A0A]">Spoken Languages</label>
              <div className="min-h-[46px] rounded-lg border border-[#E7E7E2] bg-white p-2 flex flex-wrap items-center gap-1.5 shadow-2xs">
                {languages.map((lang) => (
                  <span key={lang} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] text-sm font-semibold text-[#0A0A0A]">
                    <Languages className="w-3.5 h-3.5 text-[#66665E]" />
                    <span>{lang}</span>
                    <button
                      type="button"
                      onClick={() => (languages.length <= 1 ? message.warning('Please keep at least 1 language') : setLanguages(languages.filter((l) => l !== lang)))}
                      className="text-[#66665E] hover:text-[#0A0A0A] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                {languages.length < 10 && (
                  <Select
                    placeholder="+ Add language"
                    variant="borderless"
                    value={null}
                    onChange={(val: string | null) => val && setLanguages([...languages, val])}
                    className="min-w-[130px]"
                    options={COMMON_LANGUAGES.filter((l) => !languages.includes(l)).map((l) => ({ value: l, label: l }))}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Categories, tags, collaboration preferences */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#0A0A0A] tracking-tight">Categories</h3>
              <p className="text-xs sm:text-sm text-[#66665E] mt-0.5">Select up to 3 primary categories.</p>
            </div>
            <span className="text-xs font-extrabold px-2.5 py-1 rounded-md shrink-0 whitespace-nowrap bg-[#F4F4F0] text-[#0A0A0A]">{categories.length} / 3 Selected</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5">
            {CATEGORIES.map((cat) => {
              const isSelected = categories.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                    isSelected ? 'bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-xs' : 'bg-white hover:bg-[#FAFAF8] text-[#0A0A0A] border-[#E7E7E2]'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-white/10' : 'bg-[#F2F2EE]'}`}>
                    <CategoryIcon name={cat.id} size={15} />
                  </div>
                  <span className="text-xs font-bold block truncate flex-1">{cat.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="block text-sm font-semibold text-[#52524E]">Tags & Keywords ({tags.length}/15)</label>
            <div className="min-h-[46px] rounded-lg border border-[#E7E7E2] bg-white p-2 flex flex-wrap items-center gap-1.5 shadow-2xs">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] text-sm font-semibold text-[#0A0A0A]">
                  <span>#{tag}</span>
                  <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))} className="text-[#66665E] hover:text-[#0A0A0A] cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder={tags.length === 0 ? 'Type tag and press Enter...' : '+ Add tag'}
                value={newTagInput}
                maxLength={30}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag(newTagInput);
                  } else if (e.key === 'Backspace' && !newTagInput && tags.length) {
                    setTags(tags.slice(0, -1));
                  }
                }}
                onBlur={() => newTagInput.trim() && addTag(newTagInput)}
                className="outline-none text-xs bg-transparent min-w-[80px] flex-1 text-[#0A0A0A] placeholder-[#A3A39C] px-1 py-0.5 font-medium"
              />
            </div>
          </div>

          <div className="space-y-3 pt-5 border-t border-[#E7E7E2]">
            <div>
              <h4 className="text-base font-bold text-[#0A0A0A] tracking-tight">Collaboration Preferences</h4>
              <p className="text-xs sm:text-sm text-[#66665E] mt-0.5">Choose the partnership types you are available for.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {COLLABORATION_PREFERENCES.map((pref) => {
                const isSelected = collabPreferences.includes(pref.id);
                return (
                  <button
                    key={pref.id}
                    type="button"
                    onClick={() => togglePreference(pref.id)}
                    className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected ? 'bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-xs' : 'bg-white hover:bg-[#FAFAF8] text-[#0A0A0A] border-[#E7E7E2]'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${isSelected ? 'bg-white/10' : 'bg-[#F2F2EE]'}`}>
                      <CategoryIcon name={pref.id} size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold truncate">{pref.label}</span>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0 ml-1" />}
                      </div>
                      <p className={`text-xs mt-0.5 line-clamp-2 ${isSelected ? 'text-zinc-300' : 'text-[#66665E]'}`}>{pref.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Tab 2 — lookbook gallery (/me/gallery)
// ===========================================================================
/** Same rules as the server's `gallery` upload context (upload.constant.ts). */
const GALLERY_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const GALLERY_MAX_BYTES = 20 * 1024 * 1024;
/** Photos picked in one go (keeps the modal and the network manageable). */
const MAX_PHOTOS_PER_BATCH = 20;
const PARALLEL_UPLOADS = 3;

interface PendingPhoto {
  key: string;
  file: File;
  /** Local preview (object URL) shown while uploading. */
  localUrl: string;
  status: 'uploading' | 'ready' | 'error';
  fileId?: string;
  error?: string;
}

function GalleryTab({ gallery }: { gallery: GalleryPhoto[] | null }) {
  // Loaded by the server page; `null` = the request failed. Writes → router.refresh() → new props.
  const router = useRouter();
  const photos = gallery ?? [];
  const isLoading = false;
  const isError = gallery === null;
  const refetch = () => router.refresh();
  const studio = studioEndpoints(http);
  // Batch add: one refresh after the loop instead of one per photo.
  const createMutation = useMutation(studio.createGalleryPhoto, { refresh: false });
  const updateMutation = useMutation(studio.updateGalleryPhoto);
  const deleteMutation = useMutation(studio.deleteGalleryPhoto);
  const reorderMutation = useMutation(studio.reorderGallery);
  const creating = createMutation.loading;
  const updating = updateMutation.loading;
  const uploadFile = (file: File, context: 'gallery') => uploadFileWith(http, file, context);

  const modalFileRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<GalleryPhoto | null>(null);
  // Edit mode: one photo, optionally replaced.
  const [fileId, setFileId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  // Add mode: several photos picked at once, each uploaded on its own.
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<GalleryCategory>('lifestyle');
  const [location, setLocation] = useState('');
  const [takenAt, setTakenAt] = useState('');
  const [photoTags, setPhotoTags] = useState('');

  const atLimit = photos.length >= GALLERY_LIMIT;
  /** How many more photos fit in the gallery right now (counting the ones already picked in the modal). */
  const freeSlots = Math.max(0, GALLERY_LIMIT - photos.length - pending.length);
  const pendingUploading = pending.some((p) => p.status === 'uploading');
  const readyPhotos = pending.filter((p) => p.status === 'ready' && p.fileId);

  // Free the local preview URLs when the modal closes.
  useEffect(() => {
    if (isModalOpen) return;
    setPending((list) => {
      list.forEach((p) => URL.revokeObjectURL(p.localUrl));
      return [];
    });
  }, [isModalOpen]);

  const openAdd = () => {
    if (atLimit) return void message.warning(`You can have at most ${GALLERY_LIMIT} photos.`);
    setEditing(null);
    setFileId(null);
    setPreviewUrl('');
    setPending([]);
    setCaption('');
    setCategory('lifestyle');
    setLocation('');
    setTakenAt('');
    setPhotoTags('');
    setIsModalOpen(true);
  };

  const openEdit = (photo: GalleryPhoto) => {
    setEditing(photo);
    setFileId(null);
    setPreviewUrl(photo.photo.url);
    setCaption(photo.caption ?? '');
    setCategory(photo.category);
    setLocation(photo.location ?? '');
    setTakenAt(photo.takenAt ? photo.takenAt.slice(0, 10) : '');
    setPhotoTags(photo.tags.join(', '));
    setIsModalOpen(true);
  };

  const upload = async (file: File) => {
    const uploaded = await uploadFile(file, 'gallery');
    return { id: uploaded.id, url: uploaded.url || URL.createObjectURL(file) };
  };

  /** Uploads one picked photo and updates its tile (uploading → ready / error). */
  const uploadPending = async (item: PendingPhoto) => {
    const patch = (fields: Partial<PendingPhoto>) =>
      setPending((list) => list.map((p) => (p.key === item.key ? { ...p, ...fields } : p)));
    try {
      const { id } = await upload(item.file);
      patch({ status: 'ready', fileId: id });
    } catch (err) {
      patch({ status: 'error', error: getErrorMessage(err, 'Upload failed') });
    }
  };

  /** Runs uploads a few at a time so 20 big photos don't all hit the network at once. */
  const uploadAll = async (items: PendingPhoto[]) => {
    const queue = [...items];
    const runNext = async (): Promise<void> => {
      const next = queue.shift();
      if (!next) return;
      await uploadPending(next);
      return runNext();
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, queue.length) }, runNext));
  };

  /** Add mode: picks several photos, checks type / size / free slots, then uploads them. */
  const handlePickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    const valid = files.filter((f) => {
      if (!GALLERY_MIMES.includes(f.type)) {
        message.error(`${f.name}: only PNG, JPG, WEBP, GIF or AVIF images`);
        return false;
      }
      if (f.size > GALLERY_MAX_BYTES) {
        message.error(`${f.name}: larger than 20 MB`);
        return false;
      }
      return true;
    });
    const limit = Math.min(freeSlots, MAX_PHOTOS_PER_BATCH - pending.length);
    if (valid.length > limit) {
      message.warning(
        limit <= 0
          ? 'No more photos can be added right now.'
          : `Only ${limit} more photo${limit === 1 ? '' : 's'} can be added — the rest were skipped.`,
      );
    }
    const items: PendingPhoto[] = valid.slice(0, Math.max(0, limit)).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      localUrl: URL.createObjectURL(file),
      status: 'uploading',
    }));
    if (!items.length) return;
    setPending((list) => [...list, ...items]);
    void uploadAll(items);
  };

  const removePending = (key: string) =>
    setPending((list) => {
      const item = list.find((p) => p.key === key);
      if (item) URL.revokeObjectURL(item.localUrl);
      return list.filter((p) => p.key !== key);
    });

  const retryPending = (item: PendingPhoto) => {
    setPending((list) => list.map((p) => (p.key === item.key ? { ...p, status: 'uploading', error: undefined } : p)));
    void uploadPending(item);
  };

  /** Edit mode: replace the single photo being edited. */
  const handleModalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { id, url } = await upload(file);
      setFileId(id);
      setPreviewUrl(url);
    } catch (err) {
      message.error(getErrorMessage(err, 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  /** "Replace image" from the card menu: upload, then PATCH the photo with the new fileId. */
  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !replacingId) return;
    const hide = message.loading('Replacing photo…', 0);
    try {
      const { id } = await upload(file);
      await updateMutation.run({ id: replacingId, fileId: id });
      message.success('Photo replaced');
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      hide();
      setReplacingId(null);
    }
  };

  const handleSave = async () => {
    if (!editing && !readyPhotos.length) return void message.error('Please upload at least one photo.');
    const fields = {
      caption: caption.trim() || undefined,
      category,
      location: location.trim() || undefined,
      takenAt: takenAt || undefined,
      tags: photoTags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10),
    };
    try {
      if (editing) {
        await updateMutation.run({ id: editing.id, ...fields, ...(fileId && { fileId }) });
        message.success('Photo updated');
        setIsModalOpen(false);
        return;
      }
    } catch (err) {
      return void message.error(getErrorMessage(err));
    }

    // One request per photo (the server keeps the 60-photo limit atomic). Saved photos leave the
    // list, so if one fails the user can press "Add" again and only the rest are retried.
    setSaving(true);
    let added = 0;
    for (const item of readyPhotos) {
      try {
        await createMutation.run({ fileId: item.fileId!, ...fields });
        added += 1;
        removePending(item.key);
      } catch (err) {
        setSaving(false);
        if (added) router.refresh();
        if (added) message.success(`${added} photo${added === 1 ? '' : 's'} added`);
        return void message.error(getErrorMessage(err));
      }
    }
    setSaving(false);
    router.refresh();
    message.success(added === 1 ? 'Photo added to your gallery' : `${added} photos added to your gallery`);
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.run(id);
      message.success('Photo removed');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const ids = photos.map((p) => p.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reorderMutation.run(ids);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  return (
    <div className={`${card} space-y-6`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E7E7E2]">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Gallery</h2>
          <p className="text-sm text-[#66665E] mt-0.5">
            {photos.length}/{GALLERY_LIMIT} photos. High-resolution lookbook photos shown on your public profile.
          </p>
        </div>
        <Button
          type="primary"
          onClick={openAdd}
          disabled={atLimit}
          className="h-10 px-5 rounded-lg font-bold text-sm bg-[#0A0A0A] hover:!bg-zinc-800 !text-white border-none flex items-center gap-2 shadow-sm shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Photo</span>
        </Button>
      </div>

      <input ref={replaceFileRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceFile} />

      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#A3A39B]" />
        </div>
      ) : isError ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-[#66665E]">Could not load your gallery.</p>
          <Button onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : photos.length === 0 ? (
        <div className="py-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-center mx-auto text-[#66665E]">
            <ImageIcon className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-extrabold text-[#0A0A0A]">No Gallery Photos Yet</h3>
            <p className="text-sm text-[#66665E] max-w-sm mx-auto">
              Add editorial shoots, lifestyle portraits, or behind-the-scenes visuals to make your profile stand out.
            </p>
          </div>
          <AppButton size="md" className="!rounded-lg shrink-0" variant="primary" onClick={openAdd} icon={<Plus className="w-4 h-4" />}>
            Upload First Photo
          </AppButton>
        </div>
      ) : (
        <Image.PreviewGroup>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="rounded-lg border border-[#E7E7E2] bg-[#FAFAF8] overflow-hidden hover:border-[#0A0A0A] hover:shadow-md transition-all flex flex-col group"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-zinc-100">
                  <Image
                    src={photo.photo.url}
                    alt={photo.caption || 'Gallery photo'}
                    rootClassName="!block w-full h-full"
                    className="!w-full !h-full object-cover"
                  />
                </div>
                <div className="p-4 bg-white flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-sm text-[#0A0A0A] line-clamp-1">{photo.caption || 'Untitled photo'}</h4>
                    <span className="text-xs text-[#66665E] capitalize">{photo.category}</span>
                  </div>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'edit', icon: <Edit3 className="w-4 h-4" />, label: 'Edit Details', onClick: () => openEdit(photo) },
                        {
                          key: 'replace',
                          icon: <Upload className="w-4 h-4" />,
                          label: 'Replace Image',
                          onClick: () => {
                            setReplacingId(photo.id);
                            replaceFileRef.current?.click();
                          },
                        },
                        { key: 'left', icon: <ArrowLeft className="w-4 h-4" />, label: 'Move earlier', disabled: index === 0, onClick: () => void handleMove(index, -1) },
                        { key: 'right', icon: <ArrowRight className="w-4 h-4" />, label: 'Move later', disabled: index === photos.length - 1, onClick: () => void handleMove(index, 1) },
                        {
                          key: 'delete',
                          icon: <Trash2 className="w-4 h-4 text-rose-500" />,
                          label: <span className="text-rose-500">Remove Photo</span>,
                          onClick: () =>
                            Modal.confirm({
                              title: 'Remove photo',
                              content: 'Remove this photo from your gallery?',
                              okText: 'Remove',
                              okType: 'danger',
                              onOk: () => handleDelete(photo.id),
                            }),
                        },
                      ],
                    }}
                  >
                    <button type="button" className="w-8 h-8 rounded-lg hover:bg-[#FAFAF8] text-[#66665E] hover:text-[#0A0A0A] flex items-center justify-center cursor-pointer" title="Photo options">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </Dropdown>
                </div>
              </div>
            ))}
          </div>
        </Image.PreviewGroup>
      )}

      <Modal
        title={<h2 className="text-xl font-bold text-[#0A0A0A]">{editing ? 'Edit Photo' : 'Add Photos'}</h2>}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={520}
        centered
        destroyOnClose
      >
        <div className="py-2 space-y-4">
          {editing ? (
            <>
              <input ref={modalFileRef} type="file" accept="image/*" className="hidden" onChange={handleModalFile} />
              <div
                onClick={() => !uploading && modalFileRef.current?.click()}
                className="relative rounded-lg overflow-hidden border-2 border-dashed border-[#D2D2CA] hover:border-[#0A0A0A] bg-[#FAFAF8] h-52 flex items-center justify-center cursor-pointer"
              >
                {previewUrl ? (
                  <RemoteImage src={previewUrl} alt="Preview" className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
                ) : (
                  <div className="text-center space-y-1.5">
                    <Upload className="w-5 h-5 mx-auto text-[#0A0A0A]" />
                    <div className="text-sm font-bold text-[#0A0A0A]">Click to upload a photo</div>
                    <p className="text-xs text-[#66665E]">PNG, JPG, WEBP up to 20MB</p>
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <input
                ref={modalFileRef}
                type="file"
                accept={GALLERY_MIMES.join(',')}
                multiple
                className="hidden"
                onChange={handlePickPhotos}
              />
              {pending.length === 0 ? (
                <div
                  onClick={() => modalFileRef.current?.click()}
                  className="rounded-lg border-2 border-dashed border-[#D2D2CA] hover:border-[#0A0A0A] bg-[#FAFAF8] h-52 flex items-center justify-center cursor-pointer"
                >
                  <div className="text-center space-y-1.5 px-4">
                    <Upload className="w-5 h-5 mx-auto text-[#0A0A0A]" />
                    <div className="text-sm font-bold text-[#0A0A0A]">Click to upload photos</div>
                    <p className="text-xs text-[#66665E]">
                      Select up to {Math.min(freeSlots, MAX_PHOTOS_PER_BATCH)} at once · PNG, JPG, WEBP up to 20MB each
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {pending.map((item) => (
                    <div key={item.key} className="relative aspect-square rounded-lg overflow-hidden border border-[#E7E7E2] bg-zinc-100">
                      <RemoteImage src={item.localUrl} alt={item.file.name ?? ''} className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
                      {item.status === 'uploading' && (
                        <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                      )}
                      {item.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => retryPending(item)}
                          title={item.error}
                          className="absolute inset-0 bg-rose-600/70 text-white text-[11px] font-bold flex flex-col items-center justify-center gap-1 cursor-pointer"
                        >
                          <AlertCircle className="w-4 h-4" />
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removePending(item.key)}
                        disabled={saving}
                        aria-label="Remove photo"
                        className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {freeSlots > 0 && pending.length < MAX_PHOTOS_PER_BATCH && (
                    <button
                      type="button"
                      onClick={() => modalFileRef.current?.click()}
                      disabled={saving}
                      className="aspect-square rounded-lg border-2 border-dashed border-[#D2D2CA] hover:border-[#0A0A0A] bg-[#FAFAF8] flex flex-col items-center justify-center gap-1 text-xs font-bold text-[#66665E] cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Add more
                    </button>
                  )}
                </div>
              )}
              {pending.length > 0 && (
                <p className="text-xs text-[#66665E]">
                  {readyPhotos.length}/{pending.length} uploaded · the details below apply to every photo
                </p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">Caption</label>
            <Input value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} className="rounded-lg h-10" placeholder="e.g. Spring editorial in Paris" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">Category</label>
              <Select
                value={category}
                onChange={setCategory}
                className="w-full h-10 [&_.ant-select-selector]:!rounded-lg"
                options={GALLERY_CATEGORIES.map((c) => ({ value: c, label: c === 'bts' ? 'Behind the scenes' : c.charAt(0).toUpperCase() + c.slice(1) }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">Date taken</label>
              <Input type="date" value={takenAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setTakenAt(e.target.value)} className="rounded-lg h-10" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">Location</label>
              <Input value={location} maxLength={100} onChange={(e) => setLocation(e.target.value)} className="rounded-lg h-10" placeholder="e.g. Paris" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">Tags (comma separated)</label>
              <Input value={photoTags} onChange={(e) => setPhotoTags(e.target.value)} className="rounded-lg h-10" placeholder="Aesthetic, Lifestyle" />
            </div>
          </div>

          <div className="pt-2 border-t border-[#E7E7E2] flex items-center justify-end gap-2.5">
            <Button onClick={() => setIsModalOpen(false)} className="rounded-lg h-10 px-5 font-semibold">Cancel</Button>
            <Button
              type="primary"
              onClick={() => void handleSave()}
              loading={creating || updating || saving}
              disabled={editing ? uploading : pendingUploading || !readyPhotos.length}
              className="rounded-lg h-10 px-6 font-semibold bg-[#0A0A0A] hover:!bg-zinc-800 !text-white border-none"
            >
              {editing
                ? 'Save Changes'
                : pendingUploading
                  ? 'Uploading…'
                  : readyPhotos.length > 1
                    ? `Add ${readyPhotos.length} Photos`
                    : 'Add Photo'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ===========================================================================
// Tab 3 — social channels (PUT / DELETE /me/creator-profile/platforms/:platform)
// Stats are self-reported for now; the server marks them `connected: false` until an official API sync exists.
// ===========================================================================
function ChannelCard({ platform, profile }: { platform: (typeof PLATFORMS)[number]; profile: CreatorProfile }) {
  const stats = profile.platforms?.[platform.id];
  const upsertMutation = useMutation(profileEndpoints(http).upsertPlatform);
  const removeMutation = useMutation(profileEndpoints(http).removePlatform);
  const saving = upsertMutation.loading;
  const removing = removeMutation.loading;

  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState(stats?.handle ?? '');
  const [url, setUrl] = useState(stats?.url ?? '');
  const [followers, setFollowers] = useState<number>(stats?.followers ?? 0);
  const [engagementRate, setEngagementRate] = useState<number>(stats?.engagementRate ?? 0);
  const [avgViews, setAvgViews] = useState<number>(stats?.avgViews ?? 0);

  const startEdit = () => {
    setHandle(stats?.handle ?? '');
    setUrl(stats?.url ?? '');
    setFollowers(stats?.followers ?? 0);
    setEngagementRate(stats?.engagementRate ?? 0);
    setAvgViews(stats?.avgViews ?? 0);
    setEditing(true);
  };

  const handleSave = async () => {
    const cleanHandle = handle.trim().replace(/^@/, '');
    if (!cleanHandle) return void message.error('Please enter your account handle.');
    try {
      await upsertMutation.run({
        platform: platform.id,
        handle: cleanHandle,
        url: url.trim() || `${platform.urlPrefix}${cleanHandle}`,
        followers,
        engagementRate,
        avgViews,
      });
      message.success(`${platform.label} saved`);
      setEditing(false);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleRemove = async () => {
    try {
      await removeMutation.run(platform.id);
      message.info(`${platform.label} removed`);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const linked = Boolean(stats);
  const showForm = editing || !linked;

  return (
    <div
      className={`p-4 sm:p-6 rounded-xl border transition-all flex flex-col justify-between space-y-5 ${
        linked ? 'bg-white border-[#E7E7E2] shadow-2xs hover:border-[#0A0A0A]' : 'bg-[#FAFAF8] border-dashed border-[#D2D2CA]'
      }`}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {platform.logo}
            <div className="min-w-0">
              <h4 className="text-base font-bold text-[#0A0A0A]">{platform.label}</h4>
              <span className="block truncate text-xs text-[#66665E] font-semibold">{linked ? `@${stats!.handle}` : 'Not linked'}</span>
            </div>
          </div>
          {linked ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Check className="w-3 h-3 stroke-[3]" /> Linked
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#E7E7E2] text-[#66665E]">Not linked</span>
          )}
        </div>

        {showForm ? (
          <div className="space-y-2.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider">Handle</label>
              <Input
                prefix={<span className="text-[#66665E] text-xs font-bold">@</span>}
                value={handle.replace(/^@/, '')}
                maxLength={60}
                onChange={(e) => setHandle(e.target.value.replace(/\s+/g, ''))}
                className="rounded-lg h-10 text-sm font-semibold"
                placeholder="your_handle"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider">Profile URL</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} className="rounded-lg h-10 text-sm" placeholder={`${platform.urlPrefix}your_handle`} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#66665E] uppercase tracking-wider">Followers</label>
                <InputNumber min={0} value={followers} onChange={(v) => setFollowers(v ?? 0)} className="w-full rounded-lg" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#66665E] uppercase tracking-wider">Eng. %</label>
                <InputNumber min={0} max={100} step={0.1} value={engagementRate} onChange={(v) => setEngagementRate(v ?? 0)} className="w-full rounded-lg" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#66665E] uppercase tracking-wider">Avg views</label>
                <InputNumber min={0} value={avgViews} onChange={(v) => setAvgViews(v ?? 0)} className="w-full rounded-lg" />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-between">
            <div className="grid grid-cols-3 gap-4 flex-1">
              <div>
                <span className="text-[11px] font-bold text-[#66665E] uppercase tracking-wider block">Followers</span>
                <span className="text-lg font-black text-[#0A0A0A]">{formatFollowers(stats!.followers)}</span>
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#66665E] uppercase tracking-wider block">Eng.</span>
                <span className="text-lg font-black text-[#0A0A0A]">{stats!.engagementRate}%</span>
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#66665E] uppercase tracking-wider block">Views</span>
                <span className="text-lg font-black text-[#0A0A0A]">{formatFollowers(stats!.avgViews)}</span>
              </div>
            </div>
            {stats!.url && (
              <a href={stats!.url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-white text-[#66665E] hover:text-[#0A0A0A]" title="Visit profile">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-[#F0F0EB] flex items-center justify-between gap-2">
        {showForm ? (
          <>
            {linked && (
              <button type="button" onClick={() => setEditing(false)} className="text-xs font-bold text-[#66665E] hover:text-[#0A0A0A] cursor-pointer">
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 h-10 px-4 rounded-lg bg-[#0A0A0A] hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              <span>{linked ? 'Save' : `Link ${platform.label}`}</span>
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={startEdit} className="text-xs font-bold text-[#0A0A0A] hover:text-[#FF2D78] flex items-center gap-1 cursor-pointer">
              <Edit3 className="w-3 h-3" /> <span>Update stats</span>
            </button>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={removing}
              className="text-xs font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer disabled:opacity-60"
            >
              <Unlink className="w-3 h-3" /> <span>Remove</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ChannelsTab({ profile }: { profile: CreatorProfile }) {
  return (
    <div className={`${card} space-y-6`}>
      <div className="pb-6 border-b border-[#E7E7E2]">
        <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Social Channels</h2>
        <p className="text-sm text-[#66665E] mt-1 font-medium">
          Add your channels and audience stats. Brands see them on your profile. Total followers:{' '}
          <span className="font-bold text-[#0A0A0A]">{formatFollowers(profile.followersTotal)}</span>
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {PLATFORMS.map((p) => (
          // `key` includes the saved handle so the form resets after the server data changes.
          <ChannelCard key={`${p.id}-${profile.platforms?.[p.id]?.handle ?? ''}`} platform={p} profile={profile} />
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// Tab 4 — verified badge (/me/verification-requests)
// ===========================================================================
function VerificationTab({ profile, latest }: { profile: CreatorProfile; latest: VerificationRequest | null }) {
  const isLoading = false;
  const applyMutation = useMutation(studioEndpoints(http).applyForVerification);
  const applying = applyMutation.loading;
  const uploadFile = (file: File, context: 'verification_sample') => uploadFileWith(http, file, context);
  const sampleRef = useRef<HTMLInputElement>(null);

  const [urls, setUrls] = useState<Record<SocialPlatform, string>>({
    instagram: profile.platforms?.instagram?.url ?? '',
    tiktok: profile.platforms?.tiktok?.url ?? '',
    youtube: profile.platforms?.youtube?.url ?? '',
  });
  const [primaryPlatform, setPrimaryPlatform] = useState<SocialPlatform | undefined>(profile.platformKeys?.[0]);
  const [followersTotal, setFollowersTotal] = useState<number | null>(profile.followersTotal || null);
  const [avgViews, setAvgViews] = useState<number | null>(null);
  const [sampleTitle, setSampleTitle] = useState('');
  const [sampleUrl, setSampleUrl] = useState('');
  const [sampleFile, setSampleFile] = useState<{ id: string; name: string } | null>(null);
  const [sampleUploading, setSampleUploading] = useState(false);
  const [note, setNote] = useState('');

  if (isLoading) {
    return (
      <div className={`${card} flex justify-center py-16`}>
        <Loader2 className="w-6 h-6 animate-spin text-[#A3A39B]" />
      </div>
    );
  }

  const statusBox = (icon: React.ReactNode, title: string, body: React.ReactNode, tone: string) => (
    <div className={`p-5 rounded-lg border flex items-start gap-3 ${tone}`}>
      {icon}
      <div>
        <div className="text-sm font-bold text-[#0A0A0A]">{title}</div>
        <div className="text-sm text-[#66665E] font-medium">{body}</div>
      </div>
    </div>
  );

  if (profile.verified) {
    return (
      <div className={card}>
        {statusBox(<ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />, 'You are verified', 'The verified badge is shown on your public profile.', 'border-emerald-200 bg-emerald-50')}
      </div>
    );
  }
  if (latest?.status === 'pending') {
    return (
      <div className={card}>
        {statusBox(
          <Clock className="w-5 h-5 text-amber-600 shrink-0" />,
          'Verification request under review',
          `Request ${latest.code} was submitted on ${new Date(latest.createdAt).toLocaleDateString()}. We'll notify you when it's reviewed.`,
          'border-amber-200 bg-amber-50',
        )}
      </div>
    );
  }
  if (profile.approvalStatus !== 'approved') {
    return (
      <div className={card}>
        {statusBox(
          <AlertCircle className="w-5 h-5 text-[#66665E] shrink-0" />,
          'Not available yet',
          'Your profile must be approved by our team before you can apply for the verified badge.',
          'border-[#E7E7E2] bg-[#FAFAF8]',
        )}
      </div>
    );
  }

  const handleSample = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSampleUploading(true);
    try {
      const uploaded = await uploadFile(file, 'verification_sample');
      setSampleFile({ id: uploaded.id, name: uploaded.name });
    } catch (err) {
      message.error(getErrorMessage(err, 'Upload failed. Please try again.'));
    } finally {
      setSampleUploading(false);
    }
  };

  const handleApply = async () => {
    const platforms = Object.fromEntries(Object.entries(urls).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
    if (!Object.keys(platforms).length) return void message.error('Add at least one channel URL.');
    const hasSample = sampleTitle.trim() || sampleUrl.trim() || sampleFile;
    const body: VerificationApplyInput = {
      platforms,
      ...(primaryPlatform && { primaryPlatform }),
      ...(followersTotal != null && { followersTotal }),
      ...(avgViews != null && { avgViews }),
      ...(hasSample && {
        sampleWork: {
          ...(sampleTitle.trim() && { title: sampleTitle.trim() }),
          ...(sampleUrl.trim() && { url: sampleUrl.trim() }),
          ...(sampleFile && { fileId: sampleFile.id }),
        },
      }),
      ...(note.trim() && { note: note.trim() }),
    };
    try {
      await applyMutation.run(body);
      message.success('Verification request submitted');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  return (
    <div className={`${card} space-y-6`}>
      <div className="pb-5 border-b border-[#E7E7E2]">
        <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Verified Badge</h2>
        <p className="text-sm text-[#66665E] mt-1 font-medium">Show brands your audience is real. Our team reviews every request.</p>
      </div>

      {latest?.status === 'rejected' &&
        statusBox(
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
          'Your last request was not approved',
          latest.rejectionReason || 'You can update your details and apply again.',
          'border-rose-200 bg-rose-50',
        )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PLATFORMS.map((p) => (
          <div key={p.id} className="space-y-1">
            <label className="block text-xs font-bold text-[#66665E] uppercase tracking-wider">{p.label} URL</label>
            <Input value={urls[p.id]} onChange={(e) => setUrls({ ...urls, [p.id]: e.target.value })} className="rounded-lg h-10" placeholder={`${p.urlPrefix}your_handle`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-bold text-[#66665E] uppercase tracking-wider">Main platform</label>
          <Select value={primaryPlatform} onChange={setPrimaryPlatform} placeholder="Select" className="w-full [&_.ant-select-selector]:!rounded-lg" style={{ width: '100%' }} size="large" options={PLATFORMS.map((p) => ({ value: p.id, label: p.label }))} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-bold text-[#66665E] uppercase tracking-wider">Total followers</label>
          <InputNumber min={0} value={followersTotal} onChange={setFollowersTotal} className="rounded-lg" style={{ width: '100%' }} size="large" placeholder="0" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-bold text-[#66665E] uppercase tracking-wider">Average views</label>
          <InputNumber min={0} value={avgViews} onChange={setAvgViews} className="rounded-lg" style={{ width: '100%' }} size="large" placeholder="0" />
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <h3 className="text-base font-bold text-[#0A0A0A]">Sample work (optional)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input value={sampleTitle} maxLength={120} onChange={(e) => setSampleTitle(e.target.value)} className="rounded-lg h-10" placeholder="Title" />
          <Input value={sampleUrl} onChange={(e) => setSampleUrl(e.target.value)} className="rounded-lg h-10" placeholder="Link to the post" />
        </div>
        <input ref={sampleRef} type="file" accept="image/*,video/*,application/pdf" className="hidden" onChange={handleSample} />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => sampleRef.current?.click()} loading={sampleUploading} icon={<Upload className="w-4 h-4" />} className="rounded-lg">
            {sampleFile ? 'Replace file' : 'Upload a file'}
          </Button>
          {sampleFile && <span className="min-w-0 max-w-full text-xs font-semibold text-[#66665E] truncate">{sampleFile.name}</span>}
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-bold text-[#66665E] uppercase tracking-wider">Note for our team</label>
        <Input.TextArea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className="rounded-lg" />
      </div>

      <div className="flex justify-end">
        <AppButton size="md" className="!rounded-lg" variant="primary" onClick={() => void handleApply()} disabled={applying || sampleUploading} icon={<ShieldCheck className="w-4 h-4" />}>
          {applying ? 'Submitting…' : 'Apply for Verification'}
        </AppButton>
      </div>
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================
interface ProfileViewProps {
  /** GET /me/creator-profile — `null` = the request failed. */
  profile: CreatorProfile | null;
  /** GET /me/gallery — `null` = the request failed. */
  gallery: GalleryPhoto[] | null;
  /** GET /me/verification-requests/latest (`null` = none, or the request failed). */
  latestVerification: VerificationRequest | null;
}

function CreatorProfileContent({ profile, gallery, latestVerification }: ProfileViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const isLoading = false;
  const isError = profile === null;
  const refetch = () => router.refresh();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const tabFromUrl = (value: string | null): Tab =>
    value === 'gallery' || value === 'photos'
      ? 'gallery'
      : value === 'channels'
        ? 'channels'
        : value === 'verification'
          ? 'verification'
          : 'identity';
  const [activeTab, setActiveTab] = useState<Tab>(tabFromUrl(searchParams.get('tab')));
  useEffect(() => setActiveTab(tabFromUrl(searchParams.get('tab'))), [searchParams]);

  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader
        title="Profile"
        subtitle="Manage your creator identity, channels, and collaboration preferences."
        action={
          profile?.handle && profile.isSearchable ? (
            <AppButton size="md" className="!rounded-lg" variant="secondary" onClick={() => setIsShareModalOpen(true)} icon={<Share2 className="w-4 h-4" />}>
              Share Profile
            </AppButton>
          ) : undefined
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {profile?.approvalStatus === 'under_review' && (
          <div className="p-4 sm:p-5 rounded-lg border border-amber-200 bg-amber-50 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-[#0A0A0A]">Your profile is under review</div>
              <p className="text-sm text-[#66665E] font-medium">Brands can find and hire you once our team approves it.</p>
            </div>
          </div>
        )}
        {profile?.approvalStatus === 'action_required' && (
          <div className="p-4 sm:p-5 rounded-lg border border-rose-200 bg-rose-50 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-[#0A0A0A]">Please update your profile</div>
              <p className="text-sm text-[#66665E] font-medium">{profile.approvalNote || 'Our team asked for a few changes.'}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg p-1 border border-[#E7E7E2] inline-flex items-center gap-1 shadow-2xs w-fit max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => setActiveTab('identity')} className={tabButton(activeTab === 'identity')}>
            <User className="w-4 h-4 shrink-0" /> <span>Basic Info</span>
          </button>
          <button type="button" onClick={() => setActiveTab('gallery')} className={tabButton(activeTab === 'gallery')}>
            <ImageIcon className="w-4 h-4 shrink-0" /> <span>Gallery</span>
          </button>
          <button type="button" onClick={() => setActiveTab('channels')} className={tabButton(activeTab === 'channels')}>
            <Globe className="w-4 h-4 shrink-0" /> <span>Social Channels</span>
          </button>
          <button type="button" onClick={() => setActiveTab('verification')} className={tabButton(activeTab === 'verification')}>
            <ShieldCheck className="w-4 h-4 shrink-0" /> <span>Verification</span>
          </button>
        </div>

        {isLoading ? (
          <div className={`${card} flex justify-center py-16`}>
            <Loader2 className="w-6 h-6 animate-spin text-[#A3A39B]" />
          </div>
        ) : isError || !profile ? (
          <div className={`${card} text-center space-y-3`}>
            <p className="text-sm text-[#66665E]">Could not load your profile.</p>
            <Button onClick={() => void refetch()}>Retry</Button>
          </div>
        ) : (
          <>
            {/* `key` remounts the form with fresh values after the profile id changes. */}
            {activeTab === 'identity' && <IdentityTab key={profile.id} profile={profile} />}
            {activeTab === 'gallery' && <GalleryTab gallery={gallery} />}
            {activeTab === 'channels' && <ChannelsTab profile={profile} />}
            {activeTab === 'verification' && <VerificationTab profile={profile} latest={latestVerification} />}
          </>
        )}
      </div>

      {profile?.handle && (
        <ShareProfileModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          title={currentUser?.name || 'Creator Profile'}
          subtitle={`@${profile.handle}${profile.categories?.[0] ? ` • ${profile.categories[0]}` : ''}`}
          shareUrl={`/creators/${profile.handle}`}
          avatar={currentUser?.avatar}
          role="creator"
        />
      )}
    </div>
  );
}

/** Creator profile editor. All tab data is loaded by the server page; tabs are local UI state. */
export function ProfileView(props: ProfileViewProps) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-bold text-[#66665E]">Loading profile...</div>}>
      <CreatorProfileContent {...props} />
    </Suspense>
  );
}
