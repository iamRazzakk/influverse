'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { http } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { meEndpoints } from '@/lib/api/endpoints/me';
import { profileEndpoints, type CreatorProfileUpdate } from '@/lib/api/endpoints/profile';
import { uploadFileWith } from '@/lib/api/endpoints/upload';
import { useAuth } from '@/lib/session/AuthProvider';
import { Logo } from '@/components/shared/Logo';
import {
  COLLABORATION_LABELS,
  COMMON_LANGUAGES,
  COUNTRIES,
  CREATOR_CATEGORY_LABELS,
  GENDER_LABELS,
  labelOf,
  normalizePhone,
} from '@/components/auth/onboardingOptions';
import type { CreatorProfile, MetaOptions, SocialPlatform } from '@/types/api';
import {
  Camera,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  Clock,
  UploadCloud,
  Mail,
  Phone,
  User as UserIcon,
  AtSign,
  Loader2,
} from 'lucide-react';
import { message } from 'antd';
import { InstagramLogo, TikTokLogo, YouTubeLogo } from '@/components/shared/SocialLogos';
import { CategoryIcon } from '@/components/shared/CategoryIcon';
import { RemoteImage } from '@/components/shared/RemoteImage';

/** Server rule for creator handles (creator.constant.ts HANDLE_REGEX). */
const HANDLE_REGEX = /^[a-z0-9_.]{3,30}$/;
const TOTAL_STEPS = 6;

interface StagedMediaSample {
  file: File;
  /** Local object URL used only for the preview. */
  previewUrl: string;
  name: string;
  isVideo: boolean;
  title: string;
  type: string;
}

interface UploadedSample {
  id: string;
  previewUrl: string;
  title: string;
  type: string;
  isVideo: boolean;
}

/**
 * Creator onboarding wizard (client). The server page has already checked the session (logged-in
 * creator, onboarding not finished; already onboarded → dashboard) and loaded the saved profile +
 * dropdown options. Writes are plain API calls with no server refresh, so finishing onboarding here
 * still shows the "submitted" screen (a refresh would redirect straight to the dashboard).
 */
export function CreatorOnboardingView({
  profile,
  meta,
}: {
  /** Saved creator profile (resume after reload). `null` if it couldn't be loaded. */
  profile: CreatorProfile | null;
  /** GET /meta/options. `null` → local fallback option lists. */
  meta: MetaOptions | null;
}) {
  const router = useRouter();
  const { currentUser, reload } = useAuth();

  const updateMe = meEndpoints(http).update;
  const {
    updateCreator: updateProfile,
    upsertPlatform,
    removePlatform,
    completeCreatorOnboarding: completeOnboarding,
    addOnboardingPortfolioItem: addPortfolioItem,
  } = profileEndpoints(http);

  // Stepper: resume where the creator left off (the server keeps `onboardingStep`).
  const [step, setStep] = useState<number>(() => Math.min(Math.max(currentUser?.onboardingStep ?? 1, 1), TOTAL_STEPS));
  const totalSteps = TOTAL_STEPS;
  const [isSaving, setIsSaving] = useState(false);

  // File input refs for native upload
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const sampleFileInputRef = useRef<HTMLInputElement>(null);

  // Step 1: identity & public profile (email is the login email and can't change here)
  const [name, setName] = useState(currentUser?.name || '');
  const email = currentUser?.email || '';
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [handle, setHandle] = useState('');
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [gender, setGender] = useState<string>('');

  // Step 2: location & languages
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);

  // Step 3: categories (1–3)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Step 4: social channels — "connected" means saved on the server via PUT /platforms/:platform
  const [instagramHandle, setInstagramHandle] = useState('');
  const [isInstagramConnected, setIsInstagramConnected] = useState(false);
  const [tiktokHandle, setTiktokHandle] = useState('');
  const [isTiktokConnected, setIsTiktokConnected] = useState(false);
  const [youtubeHandle, setYoutubeHandle] = useState('');
  const [isYoutubeConnected, setIsYoutubeConnected] = useState(false);
  const [platformBusy, setPlatformBusy] = useState<SocialPlatform | null>(null);

  // Step 5: portfolio samples (optional) — each one is uploaded + saved when added
  const [portfolioSamples, setPortfolioSamples] = useState<UploadedSample[]>([]);
  const [stagedMedia, setStagedMedia] = useState<StagedMediaSample | null>(null);
  const [isSampleUploading, setIsSampleUploading] = useState(false);

  // Step 6: collaboration preferences
  const [collabPreferences, setCollabPreferences] = useState<string[]>([]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Fill the form from the saved profile once it loads (resume after a reload).
  const prefilled = useRef(false);
  useEffect(() => {
    if (!profile || prefilled.current) return;
    prefilled.current = true;
    setHandle(profile.handle ?? '');
    setBio(profile.bio ?? '');
    setGender(profile.gender ?? '');
    setCountry(profile.country ?? '');
    setCity(profile.city ?? '');
    setLanguages(profile.languages ?? []);
    setSelectedCategories(profile.categories ?? []);
    setCollabPreferences(
      profile.collaborationPreferences?.length ? profile.collaborationPreferences : ['sponsored', 'ugc', 'reviews'],
    );
    const p = profile.platforms ?? {};
    if (p.instagram?.handle) {
      setInstagramHandle(p.instagram.handle);
      setIsInstagramConnected(true);
    }
    if (p.tiktok?.handle) {
      setTiktokHandle(p.tiktok.handle);
      setIsTiktokConnected(true);
    }
    if (p.youtube?.handle) {
      setYoutubeHandle(p.youtube.handle);
      setIsYoutubeConnected(true);
    }
  }, [profile]);

  // Debounced handle availability check while typing.
  useEffect(() => {
    const value = handle.trim();
    if (!value || !HANDLE_REGEX.test(value)) {
      setHandleStatus('idle');
      return;
    }
    if (profile?.handle && profile.handle === value) {
      setHandleStatus('available');
      return;
    }
    setHandleStatus('checking');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await profileEndpoints(http).checkHandle(value, controller.signal);
        setHandleStatus(result.available ? 'available' : 'taken');
      } catch {
        if (!controller.signal.aborted) setHandleStatus('idle');
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [handle, profile?.handle]);

  // Option values come from GET /meta/options (server enums); only the labels are local.
  const categoryOptions = (meta?.creatorCategories ?? Object.keys(CREATOR_CATEGORY_LABELS)).map((id) => ({
    id,
    label: labelOf(CREATOR_CATEGORY_LABELS, id),
  }));
  const collabOptions = (meta?.collaborationPreferences ?? Object.keys(COLLABORATION_LABELS)).map((id) => ({
    id,
    label: COLLABORATION_LABELS[id]?.label ?? labelOf({}, id),
    desc: COLLABORATION_LABELS[id]?.desc ?? '',
  }));
  const genderOptions = (meta?.genders ?? Object.keys(GENDER_LABELS)).map((id) => ({
    id,
    label: labelOf(GENDER_LABELS, id),
  }));

  const toggleCollabPreference = (id: string) => {
    setCollabPreferences((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  /** Saves the fields of the current step and moves the server's `onboardingStep` forward. */
  const saveStep = async (current: number) => {
    let patch: CreatorProfileUpdate = { onboardingStep: Math.min(current + 1, TOTAL_STEPS) };

    if (current === 1) {
      await updateMe({ name: name.trim(), phone: normalizePhone(phone) || null });
      patch = {
        ...patch,
        handle: handle.trim(),
        ...(bio.trim() ? { bio: bio.trim() } : {}),
        ...(gender ? { gender } : {}),
      };
    } else if (current === 2) {
      patch = { ...patch, country, city: city.trim(), languages };
    } else if (current === 3) {
      patch = { ...patch, categories: selectedCategories };
    } else if (current === 6) {
      patch = { ...patch, collaborationPreferences: collabPreferences };
    }
    await updateProfile(patch);
  };

  // Step validation & navigation
  const handleNext = async () => {
    if (step === 1) {
      if (!name.trim()) return message.error('Please enter your full name');
      if (!HANDLE_REGEX.test(handle.trim())) return message.error('Username: 3–30 characters, a-z, 0-9, _ or .');
      if (handleStatus === 'taken') return message.error('This username is already taken');
      // Don't move on until the availability check has finished.
      if (handleStatus === 'checking') return message.info('Checking if this username is available…');
    } else if (step === 2) {
      if (!country.trim()) return message.error('Please select your country');
      if (!city.trim()) return message.error('Please enter your city');
      if (languages.length === 0) return message.error('Please select at least 1 language');
    } else if (step === 3) {
      if (selectedCategories.length < 1) return message.error('Please select at least 1 category');
      if (selectedCategories.length > 3) return message.error('You can select a maximum of 3 categories');
    } else if (step === 6) {
      if (collabPreferences.length === 0) return message.warning('Please select at least 1 collaboration preference');
    }

    setIsSaving(true);
    try {
      await saveStep(step);
      if (step < totalSteps) setStep(step + 1);
      else await handleSubmit();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // Social channels: "Connect" saves the handle on the server, "Disconnect" removes it.
  const platformState: Record<SocialPlatform, { value: string; connected: boolean; setConnected: (v: boolean) => void }> = {
    instagram: { value: instagramHandle, connected: isInstagramConnected, setConnected: setIsInstagramConnected },
    tiktok: { value: tiktokHandle, connected: isTiktokConnected, setConnected: setIsTiktokConnected },
    youtube: { value: youtubeHandle, connected: isYoutubeConnected, setConnected: setIsYoutubeConnected },
  };

  const handleToggleConnect = async (platform: SocialPlatform) => {
    const state = platformState[platform];
    const label = platform === 'youtube' ? 'YouTube' : platform === 'tiktok' ? 'TikTok' : 'Instagram';
    setPlatformBusy(platform);
    try {
      if (state.connected) {
        await removePlatform(platform);
        state.setConnected(false);
        message.info(`${label} disconnected`);
      } else {
        const clean = state.value.trim().replace(/^@+/, '');
        if (!clean) {
          message.error(`Enter your ${label} handle first`);
          return;
        }
        await upsertPlatform({ platform, handle: clean });
        state.setConnected(true);
        message.success(`${label} connected`);
      }
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setPlatformBusy(null);
    }
  };

  // Avatar: upload to storage, then save the public URL on the account.
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return message.error('Please upload an image file (PNG, JPG, WEBP).');
    if (file.size > 10 * 1024 * 1024) return message.error('Avatar file size must be under 10MB.');

    setIsAvatarUploading(true);
    try {
      const uploaded = await uploadFileWith(http, file, 'avatar');
      if (!uploaded.url) throw new Error('Upload failed');
      await updateMe({ avatar: uploaded.url });
      setAvatar(uploaded.url);
      message.success('Profile photo uploaded.');
    } catch (err) {
      message.error(getErrorMessage(err, 'Photo upload failed. Please try again.'));
    } finally {
      setIsAvatarUploading(false);
    }
  };

  // Categories toggle (max 3)
  const toggleCategory = (catId: string) => {
    if (selectedCategories.includes(catId)) {
      setSelectedCategories((prev) => prev.filter((c) => c !== catId));
    } else {
      if (selectedCategories.length >= 3) {
        message.warning('You can choose a maximum of 3 categories.');
        return;
      }
      setSelectedCategories((prev) => [...prev, catId]);
    }
  };

  // Languages toggle
  const toggleLanguage = (lang: string) => {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  };

  // Staged portfolio file (local preview only until "Add to Portfolio" uploads it)
  const handlePortfolioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) return message.error('Please upload an image or video file.');
    if (file.size > 300 * 1024 * 1024) return message.error('File size exceeds the 300MB limit.');

    if (stagedMedia) URL.revokeObjectURL(stagedMedia.previewUrl);
    setStagedMedia({
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      isVideo,
      title: file.name.replace(/\.[^/.]+$/, '').slice(0, 120),
      type: isVideo ? 'Reel' : 'Photo',
    });
  };

  const confirmAddStagedSample = async () => {
    if (!stagedMedia) return;
    if (!stagedMedia.title.trim()) return message.error('Please enter a title for this sample.');

    setIsSampleUploading(true);
    try {
      const uploaded = await uploadFileWith(http, stagedMedia.file, 'portfolio');
      const item = await addPortfolioItem({
        fileId: uploaded.id,
        title: stagedMedia.title.trim(),
        mediaType: stagedMedia.isVideo ? 'video' : 'image',
        deliverableType: stagedMedia.type,
      });
      setPortfolioSamples((prev) => [
        ...prev,
        {
          id: item.id,
          previewUrl: stagedMedia.previewUrl,
          title: stagedMedia.title.trim(),
          type: stagedMedia.type,
          isVideo: stagedMedia.isVideo,
        },
      ]);
      setStagedMedia(null);
      if (sampleFileInputRef.current) sampleFileInputRef.current.value = '';
      message.success('Sample added to portfolio!');
    } catch (err) {
      message.error(getErrorMessage(err, 'Upload failed. Please try again.'));
    } finally {
      setIsSampleUploading(false);
    }
  };

  /** Samples are already saved on the server; this only hides them here. Manage them on the Portfolio page. */
  const removeSample = (idx: number) => {
    setPortfolioSamples((prev) => prev.filter((_, i) => i !== idx));
    message.info('You can delete saved samples later from your Portfolio page.');
  };

  // Final submit: the server checks required fields and puts the profile in the review queue.
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await completeOnboarding();
      setIsSubmitted(true);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // "Go to Creator Dashboard" on the submitted screen: re-read the session (now `onboardingCompleted`),
  // then enter the workspace.
  const goToDashboard = async () => {
    await reload();
    router.push('/creator/dashboard');
  };

  const stepTitles = ['Profile', 'Location', 'Categories', 'Channels', 'Portfolio', 'Preferences'];

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col justify-between font-sans selection:bg-[#FF2D78]/20 selection:text-[#FF2D78]">
      {/* Header */}
      <header className="border-b border-[#E7E7E2] bg-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#66665E]">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Creator Setup</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center py-10 sm:py-14 px-4 sm:px-6">
        <div className="w-full max-w-2xl space-y-6">
          {/* Progress Bar & Stepper */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-[#FF2D78]">
                  Step {step} of {totalSteps}
                </span>
                <h1 className="text-xl font-black text-[#0A0A0A]">{stepTitles[step - 1]}</h1>
              </div>
              <span className="text-sm font-bold px-3 py-1 rounded-full bg-[#F4F4F0] text-[#0A0A0A]">
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
          <div className="bg-white p-7 sm:p-9 rounded-3xl border border-[#E7E7E2] shadow-xl shadow-black/[0.03] space-y-6">
            {/* STEP 1: ACCOUNT CREDENTIALS & PROFILE */}
            {step === 1 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-2xl font-black text-[#0A0A0A] tracking-tight">Profile Details</h2>
                  <p className="text-sm text-[#66665E] font-medium mt-1">
                    Set up your basic account and public creator details.
                  </p>
                </div>

                {/* Profile Photo (Centered) */}
                <div className="flex flex-col items-center justify-center text-center py-1">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    style={{ display: 'none' }}
                    onChange={handleAvatarFileChange}
                  />

                  {isAvatarUploading ? (
                    <div className="w-24 h-24 rounded-full border-2 border-dashed border-[#D2D2CA] bg-[#FAFAF8] flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-[#66665E]" />
                    </div>
                  ) : avatar ? (
                    <div
                      onClick={() => avatarInputRef.current?.click()}
                      className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-[#0A0A0A] shadow-md cursor-pointer group transition-transform hover:scale-105"
                    >
                      <RemoteImage src={avatar} alt="Avatar" className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
                      <div className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="w-5 h-5 mb-1" />
                        <span className="text-xs font-bold">Change</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => avatarInputRef.current?.click()}
                      className="w-24 h-24 rounded-full border-2 border-dashed border-[#D2D2CA] hover:border-[#0A0A0A] bg-[#FAFAF8] hover:bg-[#F4F4F0] flex flex-col items-center justify-center cursor-pointer transition-all text-[#66665E] hover:text-[#0A0A0A] group hover:scale-105"
                    >
                      <Camera className="w-7 h-7 mb-1 text-[#0A0A0A] group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">Upload</span>
                    </div>
                  )}

                  <div className="mt-2.5 space-y-0.5 text-center">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="text-sm font-bold text-[#0A0A0A] hover:text-[#FF2D78] transition-colors cursor-pointer block mx-auto"
                    >
                      {avatar ? 'Click photo to change' : 'Click to upload photo'}
                    </button>
                    <div className="text-sm text-[#66665E]">
                      JPG, PNG, or WEBP up to 10MB
                    </div>
                  </div>
                </div>

                {/* Full Name & Username */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#0A0A0A] block">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Alex Morgan"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:ring-0 text-sm font-medium text-[#0A0A0A] outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#0A0A0A] block">
                      Username <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <AtSign className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                      <input
                        type="text"
                        value={handle}
                        autoComplete="off"
                        onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                        placeholder="yourusername"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:ring-0 text-sm font-medium text-[#0A0A0A] outline-none transition-all"
                      />
                    </div>
                    {handleStatus !== 'idle' && (
                      <p
                        className={`text-xs font-semibold ${
                          handleStatus === 'available' ? 'text-emerald-600' : handleStatus === 'taken' ? 'text-rose-600' : 'text-[#66665E]'
                        }`}
                      >
                        {handleStatus === 'checking' ? 'Checking availability…' : handleStatus === 'available' ? 'Username is available' : 'Username is taken'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Contact Information (2 Columns - Private Account Only) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#0A0A0A] block">
                      Account Email <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                      <input
                        type="email"
                        value={email}
                        readOnly
                        title="Your login email. Change it from account settings."
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E7E7E2] bg-[#FAFAF8] text-sm font-medium text-[#66665E] outline-none cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#0A0A0A] block">
                      Phone Number <span className="text-xs text-[#71716A] font-normal">(Private)</span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:ring-0 text-sm font-medium text-[#0A0A0A] outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Gender (Segmented Selection) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-[#0A0A0A] block">
                    Gender
                  </label>
                  <div className="grid grid-cols-3 gap-2.5 max-w-xs sm:max-w-sm">
                    {genderOptions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setGender(item.id)}
                        className={`py-2.5 px-3 rounded-xl text-sm font-bold transition-all border text-center cursor-pointer ${
                          gender === item.id
                            ? 'bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-xs'
                            : 'bg-white text-[#555550] border-[#E7E7E2] hover:bg-[#F4F4F0] hover:text-[#0A0A0A]'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bio */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-[#0A0A0A] block">
                      Bio
                    </label>
                    <span className="text-sm text-[#66665E] font-medium">{bio.length}/160</span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={160}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell brands what you create, your aesthetics, and what makes your content unique..."
                    className="w-full px-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:ring-0 text-sm font-medium text-[#0A0A0A] outline-none transition-all resize-none"
                  />
                </div>
              </div>
            )}

            {/* STEP 2: LOCATION & LANGUAGES */}
            {step === 2 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-2xl font-black text-[#0A0A0A] tracking-tight">Location &amp; Languages</h2>
                  <p className="text-sm text-[#66665E] font-medium mt-1">
                    Where you are based and languages you speak.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#0A0A0A] block">
                      Country <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full px-3.5 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] bg-white text-sm font-medium text-[#0A0A0A] outline-none cursor-pointer"
                    >
                      <option value="">Select country...</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#0A0A0A] block">
                      City <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. London, Zürich, Berlin"
                      className="w-full px-4 py-3 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:ring-0 text-sm font-medium text-[#0A0A0A] outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Languages */}
                <div className="space-y-2.5">
                  <label className="text-sm font-bold text-[#0A0A0A] block">
                    Content Languages <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_LANGUAGES.map((l) => {
                      const isSelected = languages.includes(l);
                      return (
                        <button
                          key={l}
                          type="button"
                          onClick={() => toggleLanguage(l)}
                          className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#0A0A0A] text-white shadow-xs'
                              : 'bg-[#F4F4F0] text-[#555550] hover:bg-[#E7E7E2]'
                          }`}
                        >
                          {l}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: CATEGORIES */}
            {step === 3 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-[#0A0A0A] tracking-tight">Categories</h2>
                    <p className="text-sm text-[#66665E] font-medium mt-1">
                      Choose 1 to 3 categories that define your work.
                    </p>
                  </div>
                  <span className="text-sm font-bold px-3 py-1 rounded-full bg-[#FFF0F5] text-[#FF2D78]">
                    {selectedCategories.length} / 3 selected
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categoryOptions.map((cat) => {
                    const isSelected = selectedCategories.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-xs'
                            : 'bg-white text-[#0A0A0A] border-[#E7E7E2] hover:bg-[#FAFAF8]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <CategoryIcon name={cat.id} size={20} className={isSelected ? 'text-white' : 'text-[#0A0A0A]'} />
                          <span className="text-sm font-extrabold">{cat.label}</span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 4: SOCIAL CHANNELS */}
            {step === 4 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-2xl font-black text-[#0A0A0A] tracking-tight">Social Channels</h2>
                  <p className="text-sm text-[#66665E] font-medium mt-1">
                    Connect the profiles where you publish content.
                  </p>
                </div>

                {/* Instagram */}
                <div
                  className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                    isInstagramConnected
                      ? 'bg-[#FAFCFA] border-emerald-300 ring-1 ring-emerald-300/40 shadow-xs'
                      : 'bg-white border-[#E7E7E2]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0 w-10 h-10 flex items-center justify-center">
                      <InstagramLogo className="w-10 h-10 rounded-xl" />
                      {isInstagramConnected && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#0A0A0A]">Instagram</span>
                        {isInstagramConnected && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#66665E] font-medium mt-0.5 truncate whitespace-nowrap">
                        {isInstagramConnected ? 'Account linked to profile' : 'Connect your Instagram account'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-52">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#A3A39C]">@</span>
                      <input
                        type="text"
                        value={instagramHandle}
                        onChange={(e) => setInstagramHandle(e.target.value)}
                        placeholder="your_handle"
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] text-sm font-medium text-[#0A0A0A] outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleConnect('instagram')}
                      disabled={platformBusy === 'instagram'}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        isInstagramConnected
                          ? 'bg-[#F4F4F0] hover:bg-rose-50 text-[#66665E] hover:text-rose-600 border border-[#E7E7E2] hover:border-rose-200'
                          : 'bg-[#0A0A0A] hover:bg-black text-white'
                      }`}
                    >
                      {isInstagramConnected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                </div>

                {/* TikTok */}
                <div
                  className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                    isTiktokConnected
                      ? 'bg-[#FAFCFA] border-emerald-300 ring-1 ring-emerald-300/40 shadow-xs'
                      : 'bg-white border-[#E7E7E2]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0 w-10 h-10 flex items-center justify-center">
                      <TikTokLogo className="w-10 h-10 rounded-xl" />
                      {isTiktokConnected && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#0A0A0A]">TikTok</span>
                        {isTiktokConnected && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#66665E] font-medium mt-0.5 truncate whitespace-nowrap">
                        {isTiktokConnected ? 'Account linked to profile' : 'Connect your TikTok account'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-52">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#A3A39C]">@</span>
                      <input
                        type="text"
                        value={tiktokHandle}
                        onChange={(e) => setTiktokHandle(e.target.value)}
                        placeholder="your_handle"
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] text-sm font-medium text-[#0A0A0A] outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleConnect('tiktok')}
                      disabled={platformBusy === 'tiktok'}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        isTiktokConnected
                          ? 'bg-[#F4F4F0] hover:bg-rose-50 text-[#66665E] hover:text-rose-600 border border-[#E7E7E2] hover:border-rose-200'
                          : 'bg-[#0A0A0A] hover:bg-black text-white'
                      }`}
                    >
                      {isTiktokConnected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                </div>

                {/* YouTube */}
                <div
                  className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                    isYoutubeConnected
                      ? 'bg-[#FAFCFA] border-emerald-300 ring-1 ring-emerald-300/40 shadow-xs'
                      : 'bg-white border-[#E7E7E2]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0 w-10 h-10 flex items-center justify-center">
                      <YouTubeLogo className="w-10 h-10" />
                      {isYoutubeConnected && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#0A0A0A]">YouTube</span>
                        {isYoutubeConnected && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#66665E] font-medium mt-0.5 truncate whitespace-nowrap">
                        {isYoutubeConnected ? 'Channel linked to profile' : 'Connect your YouTube channel'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-52">
                      <input
                        type="text"
                        value={youtubeHandle}
                        onChange={(e) => setYoutubeHandle(e.target.value)}
                        placeholder="Channel Name"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] text-sm font-medium text-[#0A0A0A] outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleConnect('youtube')}
                      disabled={platformBusy === 'youtube'}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        isYoutubeConnected
                          ? 'bg-[#F4F4F0] hover:bg-rose-50 text-[#66665E] hover:text-rose-600 border border-[#E7E7E2] hover:border-rose-200'
                          : 'bg-[#0A0A0A] hover:bg-black text-white'
                      }`}
                    >
                      {isYoutubeConnected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: PORTFOLIO (File Upload Only & Skippable) */}
            {step === 5 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-[#0A0A0A] tracking-tight">Portfolio</h2>
                    <p className="text-sm text-[#66665E] font-medium mt-1">
                      Upload image or video files. <span className="text-[#FF2D78] font-bold">This step is optional.</span>
                    </p>
                  </div>
                  <span className="text-sm font-bold px-3 py-1 rounded-full bg-zinc-100 text-[#0A0A0A]">
                    {portfolioSamples.length} Uploaded
                  </span>
                </div>

                {/* Hidden File Picker */}
                <input
                  ref={sampleFileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  style={{ display: 'none' }}
                  onChange={handlePortfolioFileChange}
                />

                {/* Native File Upload Area */}
                {!stagedMedia ? (
                  <div
                    onClick={() => sampleFileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#D2D2CA] hover:border-[#0A0A0A] rounded-2xl p-8 text-center cursor-pointer transition-all bg-[#FAFAF8] hover:bg-[#F4F4F0] space-y-2 group"
                  >
                    <div className="w-12 h-12 rounded-full bg-white border border-[#E7E7E2] group-hover:border-[#0A0A0A] group-hover:scale-105 transition-all flex items-center justify-center mx-auto text-[#0A0A0A] shadow-xs">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="text-base font-bold text-[#0A0A0A]">
                      Click to choose video or photo file
                    </div>
                    <div className="text-sm text-[#66665E]">
                      Supports MP4, MOV, WEBM, PNG, JPG up to 300MB
                    </div>
                  </div>
                ) : (
                  /* Staged Media Ready to Add */
                  <div className="p-5 rounded-2xl border-2 border-[#0A0A0A] bg-[#FAFAF8] space-y-4">
                    <div className="flex items-start gap-4">
                      {stagedMedia.isVideo ? (
                        <video
                          src={stagedMedia.previewUrl}
                          controls
                          className="w-36 h-28 rounded-xl object-cover bg-black shrink-0"
                        />
                      ) : (
                        <RemoteImage
                          src={stagedMedia.previewUrl}
                          alt="Staged"
                          className="w-36 h-28 rounded-xl object-cover border border-[#E7E7E2] shrink-0" width={288} height={288} sizes="144px" />
                      )}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#0A0A0A] text-white">
                            {stagedMedia.isVideo ? 'Video' : 'Image'}
                          </span>
                          <span className="text-sm text-[#66665E] truncate">{stagedMedia.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => sampleFileInputRef.current?.click()}
                          className="text-sm font-bold text-[#FF2D78] hover:underline cursor-pointer"
                        >
                          Change File
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 border-t border-[#E7E7E2]">
                      <div className="space-y-1.5">
                        <label className="text-sm font-bold text-[#0A0A0A] block">
                          Sample Title
                        </label>
                        <input
                          type="text"
                          value={stagedMedia.title}
                          onChange={(e) =>
                            setStagedMedia({ ...stagedMedia, title: e.target.value })
                          }
                          placeholder="e.g. Summer Lookbook or Product Review"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E2] bg-white text-sm font-medium text-[#0A0A0A] outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-bold text-[#0A0A0A] block">
                          Format
                        </label>
                        <select
                          value={stagedMedia.type}
                          onChange={(e) =>
                            setStagedMedia({ ...stagedMedia, type: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E2] bg-white text-sm font-bold text-[#0A0A0A] outline-none cursor-pointer"
                        >
                          <option value="Reel">Reel / Vertical Video</option>
                          <option value="UGC Ad">UGC Video Ad</option>
                          <option value="Photo">Photo Shoot</option>
                          <option value="Video">Full Video</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setStagedMedia(null)}
                        className="px-4 py-2 rounded-xl border border-[#E7E7E2] text-sm font-bold text-[#66665E] hover:text-[#0A0A0A] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmAddStagedSample}
                        disabled={isSampleUploading}
                        className="px-5 py-2 rounded-xl bg-[#0A0A0A] hover:bg-black text-white text-sm font-bold cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                      >
                        {isSampleUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        <span>{isSampleUploading ? 'Uploading…' : 'Add to Portfolio'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Uploaded Samples Grid */}
                {portfolioSamples.length > 0 ? (
                  <div className="space-y-2.5 pt-2">
                    <span className="text-sm font-bold text-[#0A0A0A] block">
                      Portfolio Samples ({portfolioSamples.length})
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {portfolioSamples.map((s, idx) => (
                        <div
                          key={s.id}
                          className="relative rounded-2xl overflow-hidden aspect-[4/5] bg-black group border border-[#E7E7E2]"
                        >
                          {s.isVideo ? (
                            <video src={s.previewUrl} className="w-full h-full object-cover opacity-80" />
                          ) : (
                            <RemoteImage src={s.previewUrl} alt={s.title ?? ''} className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-3 flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/60 text-white backdrop-blur-xs">
                                {s.type}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeSample(idx)}
                                className="text-white/80 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-sm font-bold text-white leading-tight truncate">
                              {s.title}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* STEP 6: COLLABORATION PREFERENCES */}
            {step === 6 && (
              <div className="space-y-5 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-2xl font-black text-[#0A0A0A] tracking-tight">Collaboration Preferences</h2>
                  <p className="text-sm text-[#66665E] font-medium mt-1">
                    Select the collaboration formats you are available for.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {collabOptions.map((pref) => {
                    const isSelected = collabPreferences.includes(pref.id);
                    return (
                      <div
                        key={pref.id}
                        onClick={() => toggleCollabPreference(pref.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                          isSelected
                            ? 'bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-md'
                            : 'bg-white text-[#0A0A0A] border-[#E7E7E2] hover:bg-[#FAFAF8] hover:border-[#D2D2CA]'
                        }`}
                      >
                        <CategoryIcon name={pref.id} size={22} className={`shrink-0 mt-0.5 ${isSelected ? 'text-white' : 'text-[#0A0A0A]'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold">{pref.label}</span>
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                isSelected ? 'bg-white text-black' : 'border border-[#D2D2CA]'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                          </div>
                          <p
                            className={`text-xs mt-1 leading-snug ${
                              isSelected ? 'text-white/80' : 'text-[#66665E]'
                            }`}
                          >
                            {pref.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center gap-3 pt-5 border-t border-[#F4F4F0]">
              {step > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="py-3 px-5 rounded-2xl border border-[#E7E7E2] hover:border-[#0A0A0A] text-sm font-bold text-[#0A0A0A] transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
              )}

              {/* In step 5, allow explicit Skip for now option to jump to Step 6 */}
              {step === 5 && (
                <button
                  type="button"
                  disabled={isSubmitting || isSaving}
                  onClick={() => setStep(6)}
                  className="py-3.5 px-6 rounded-2xl border border-[#E7E7E2] hover:border-[#0A0A0A] text-sm font-bold text-[#66665E] hover:text-[#0A0A0A] transition-all cursor-pointer"
                >
                  Skip for Now
                </button>
              )}

              <button
                type="button"
                disabled={isSubmitting || isSaving}
                onClick={handleNext}
                className="flex-1 py-3.5 px-6 rounded-2xl bg-[#0A0A0A] hover:bg-black text-white font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {(isSaving || isSubmitting) && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{step === totalSteps ? 'Submit for Review' : 'Continue'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Post-Submission Review Pipeline Screen */}
      {isSubmitted && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-7 sm:p-9 max-w-lg w-full shadow-2xl border border-[#E7E7E2] space-y-6 animate-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-inner border border-emerald-100">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <h3 className="text-2xl font-black text-[#0A0A0A]">
                Application Submitted
              </h3>
              <p className="text-sm text-[#66665E] font-medium max-w-md mx-auto">
                We&apos;ve received your application and will notify you once your profile is approved.
              </p>
            </div>

            {/* Premium Curation Status Card */}
            <div className="bg-gradient-to-br from-[#FAFAF8] to-[#F5F5F0] p-5 rounded-2xl border border-[#E7E7E2] text-left shadow-2xs space-y-3">
              <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 border border-amber-500/20 shadow-2xs">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-[#0A0A0A] tracking-tight">
                      Under Curation Review
                    </div>
                    <div className="text-xs text-[#66665E] font-medium mt-0.5">
                      Our editorial team reviews new creators within 24 hours.
                    </div>
                  </div>
                </div>

                <span className="self-start shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-[11px] font-extrabold text-amber-700 tracking-wide uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  24h Review
                </span>
              </div>

              {/* Informative Sub-badges */}
              <div className="pt-3 border-t border-[#E7E7E2] flex flex-wrap items-center justify-between gap-2 text-xs text-[#66665E] font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-emerald-600 font-bold">✓</span> Full workspace access unlocked
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-emerald-600 font-bold">✓</span> Email notification upon approval
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={goToDashboard}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#0A0A0A] hover:bg-black text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Go to Creator Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
