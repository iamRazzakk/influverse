'use client';

import React, { useState, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/session/AuthProvider';
import { http } from '@/lib/api/client';
import { useMutation } from '@/lib/hooks/useMutation';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { PortfolioVideoModal, portfolioPlatformLabel } from '@/components/shared/PortfolioVideoModal';
import {
  PORTFOLIO_LIMIT,
  studioEndpoints,
  type AspectRatio,
  type PortfolioInput,
  type PortfolioItem,
} from '@/lib/api/endpoints/studio';
import { uploadFileWith } from '@/lib/api/endpoints/upload';
import { getErrorMessage } from '@/lib/api/errors';
import type { CreatorProfile } from '@/types/api';
import {
  Film,
  Layers,
  Plus,
  Edit3,
  Trash2,
  Play,
  Upload,
  MoreVertical,
  Check,
  X,
  Loader2,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { Button, Modal, Input, Select, message, Dropdown } from 'antd';
import { InstagramLogo, TikTokLogo, YouTubeLogo } from '@/components/shared/SocialLogos';
import { CategoryIcon } from '@/components/shared/CategoryIcon';
import { RemoteImage } from '@/components/shared/RemoteImage';

type Platform = 'instagram' | 'tiktok' | 'youtube' | 'ugc';
const ALL_PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube', 'ugc'];

const platformIcon = (val: string, size = 'w-3.5 h-3.5') => {
  if (val === 'instagram') return <InstagramLogo className={`${size} shrink-0 rounded-xs`} />;
  if (val === 'tiktok') return <TikTokLogo className={`${size} shrink-0 rounded-xs`} />;
  if (val === 'youtube') return <YouTubeLogo className={`${size} shrink-0 rounded-xs`} />;
  if (val === 'ugc') return <CategoryIcon name="ugc" size={14} className="text-purple-600 shrink-0" />;
  return <Layers className={`${size} text-amber-600 shrink-0`} />;
};

const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', ugc: 'UGC Ads' };

/** Reads duration + aspect ratio of a picked file in the browser, so the creator doesn't type them. */
const inspectMedia = (file: File) =>
  new Promise<{ mediaType: 'image' | 'video'; aspectRatio: AspectRatio; durationSec?: number }>((resolve) => {
    const isVideo = file.type.startsWith('video');
    const url = URL.createObjectURL(file);
    const toAspect = (w: number, h: number): AspectRatio => (h > w * 1.15 ? '9:16' : w > h * 1.15 ? '16:9' : '1:1');
    if (isVideo) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve({ mediaType: 'video', aspectRatio: toAspect(video.videoWidth, video.videoHeight), durationSec: Math.round(video.duration) || undefined });
        URL.revokeObjectURL(url);
      };
      video.onerror = () => resolve({ mediaType: 'video', aspectRatio: '9:16' });
      video.src = url;
    } else {
      const img = new Image();
      img.onload = () => {
        resolve({ mediaType: 'image', aspectRatio: toAspect(img.naturalWidth, img.naturalHeight) });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => resolve({ mediaType: 'image', aspectRatio: '1:1' });
      img.src = url;
    }
  });

function CreatorPortfolioContent({ items }: { items: PortfolioItem[] | null }) {
  const router = useRouter();
  const { currentUser, profile } = useAuth();
  const creatorProfile = profile as CreatorProfile | null;

  // Loaded by the server page; `null` = the request failed. Writes → router.refresh() → new props.
  const portfolioList = items ?? [];
  const isLoading = false;
  const isError = items === null;
  const refetch = () => router.refresh();
  const studio = studioEndpoints(http);
  const createMutation = useMutation(studio.createPortfolioItem);
  const updateMutation = useMutation(studio.updatePortfolioItem);
  const deleteMutation = useMutation(studio.deletePortfolioItem);
  const reorderMutation = useMutation(studio.reorderPortfolio);
  const isCreating = createMutation.loading;
  const isUpdating = updateMutation.loading;

  const [platformFilter, setPlatformFilter] = useState<'all' | Platform>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [previewingItem, setPreviewingItem] = useState<PortfolioItem | null>(null);

  // Form state
  const [brandName, setBrandName] = useState('');
  const [title, setTitle] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['instagram']);
  const [deliverableType, setDeliverableType] = useState('');
  const [description, setDescription] = useState('');
  // Media: fileId is set after the upload finishes; previewUrl is what we show in the form.
  const [fileId, setFileId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [mediaInfo, setMediaInfo] = useState<{ mediaType: 'image' | 'video'; aspectRatio?: AspectRatio; durationSec?: number }>({
    mediaType: 'video',
  });
  const [isUploading, setIsUploading] = useState(false);

  const mediaInputRef = useRef<HTMLInputElement>(null);

  const filteredList =
    platformFilter === 'all' ? portfolioList : portfolioList.filter((item) => item.platforms.includes(platformFilter));

  const atLimit = portfolioList.length >= PORTFOLIO_LIMIT;

  const resetForm = () => {
    setBrandName('');
    setTitle('');
    setSelectedPlatforms(['instagram']);
    setDeliverableType('');
    setDescription('');
    setFileId(null);
    setPreviewUrl('');
    setMediaInfo({ mediaType: 'video' });
  };

  const openAddModal = () => {
    if (atLimit) {
      message.warning(`You can have at most ${PORTFOLIO_LIMIT} portfolio items.`);
      return;
    }
    setPreviewingItem(null);
    setEditingItemId(null);
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (item: PortfolioItem) => {
    setPreviewingItem(null);
    setEditingItemId(item.id);
    setBrandName(item.brandName && item.brandName !== 'Personal Work' ? item.brandName : '');
    setTitle(item.title);
    setSelectedPlatforms((item.platforms.filter((p) => ALL_PLATFORMS.includes(p as Platform)) as Platform[]) || []);
    setDeliverableType(item.deliverableType ?? '');
    setDescription(item.description ?? '');
    setFileId(null); // only sent if the creator picks a new file
    setPreviewUrl(item.mediaType === 'video' ? item.thumbnailUrl || item.media.url : item.media.url);
    setMediaInfo({ mediaType: item.mediaType, aspectRatio: item.aspectRatio, durationSec: item.durationSec });
    setIsModalOpen(true);
  };

  const handlePlatformsChange = (values: (Platform | 'all')[]) => {
    if (values.includes('all')) {
      setSelectedPlatforms(selectedPlatforms.length === ALL_PLATFORMS.length ? ['instagram'] : [...ALL_PLATFORMS]);
      return;
    }
    setSelectedPlatforms(values.filter((v): v is Platform => v !== 'all'));
  };

  const tagRender = (props: { value: string; closable: boolean; onClose: () => void }) => {
    const { value, closable, onClose } = props;
    if (value === 'all') return <span className="hidden" />;
    return (
      <span
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] text-[#0A0A0A] font-bold text-xs mr-1.5 my-0.5 shadow-2xs"
      >
        {platformIcon(value)}
        <span>{PLATFORM_LABEL[value] ?? value}</span>
        {closable && (
          <button type="button" onClick={onClose} className="hover:text-rose-600 text-[#8E8E87] ml-0.5 flex items-center" aria-label="Remove platform">
            <X className="w-3 h-3" />
          </button>
        )}
      </span>
    );
  };

  /** Uploads the picked file to S3 right away; saving the form then only sends the fileId. */
  const handleMediaPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploading(true);
    try {
      const [info, uploaded] = await Promise.all([inspectMedia(file), uploadFileWith(http, file, 'portfolio')]);
      setMediaInfo(info);
      setFileId(uploaded.id);
      setPreviewUrl(uploaded.url || URL.createObjectURL(file));
      if (!title.trim()) {
        setTitle(
          file.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[_-]+/g, ' ')
            .trim()
            .slice(0, 120),
        );
      }
    } catch (err) {
      message.error(getErrorMessage(err, 'Upload failed. Please try again.'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return void message.error('Please enter a title.');
    if (!editingItemId && !fileId) return void message.error('Please upload an image or video.');

    const fields: Omit<PortfolioInput, 'fileId'> = {
      title: title.trim(),
      brandName: brandName.trim() || undefined,
      description: description.trim() || undefined,
      deliverableType: deliverableType.trim() || undefined,
      platforms: selectedPlatforms,
      ...(fileId && {
        mediaType: mediaInfo.mediaType,
        aspectRatio: mediaInfo.aspectRatio,
        durationSec: mediaInfo.durationSec,
      }),
    };

    try {
      if (editingItemId) {
        await updateMutation.run({ id: editingItemId, ...fields, ...(fileId && { fileId }) });
        message.success(`Updated "${fields.title}"`);
      } else {
        await createMutation.run({ ...fields, fileId: fileId! });
        message.success(`Added "${fields.title}" to your portfolio`);
      }
      setIsModalOpen(false);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleDelete = async (item: PortfolioItem) => {
    try {
      await deleteMutation.run(item.id);
      message.success(`Removed "${item.title}" from your portfolio.`);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  /** Swaps an item with its neighbour and saves the order (only in the unfiltered view). */
  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= portfolioList.length) return;
    const ids = portfolioList.map((p) => p.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reorderMutation.run(ids);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader
        title="Portfolio"
        subtitle="Your creative projects and brand collaborations."
        action={
          <Button
            type="primary"
            onClick={openAddModal}
            disabled={atLimit}
            className="h-10 px-5 rounded-lg font-bold text-sm bg-[#0A0A0A] hover:!bg-zinc-800 !text-white border-none flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Work</span>
          </Button>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div className="sm:bg-white sm:rounded-xl sm:p-6 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-5 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 sm:pb-5 border-b border-[#E7E7E2]">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Portfolio</h2>
              <p className="text-xs sm:text-sm text-[#66665E] mt-1 font-medium">
                {portfolioList.length}/{PORTFOLIO_LIMIT} items. Showcase of your past work and collaborations.
              </p>
            </div>

            <div className="inline-flex items-center p-1 rounded-lg bg-white sm:bg-[#FAFAF8] border border-[#E7E7E2] overflow-x-auto shrink-0 max-w-full self-start sm:self-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ key: 'all', label: 'All' }, ...ALL_PLATFORMS.map((p) => ({ key: p, label: PLATFORM_LABEL[p] }))].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPlatformFilter(tab.key as 'all' | Platform)}
                  className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    platformFilter === tab.key ? 'bg-[#0A0A0A] text-white shadow-2xs' : 'text-[#66665E] hover:text-[#0A0A0A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#A3A39B]" />
            </div>
          ) : isError ? (
            <EmptyState
              icon={<Film className="w-8 h-8 text-[#66665E]" />}
              title="Could not load your portfolio"
              description="Please check your connection and try again."
              primaryAction={{ label: 'Retry', onClick: () => void refetch() }}
            />
          ) : filteredList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {filteredList.map((item) => {
                const index = portfolioList.indexOf(item);
                const thumb = item.mediaType === 'video' ? item.thumbnailUrl : item.media.url;
                return (
                  <div
                    key={item.id}
                    onClick={() => setPreviewingItem(item)}
                    className="rounded-xl border border-[#E7E7E2] bg-white overflow-hidden shadow-2xs hover:shadow-md hover:border-[#0A0A0A] transition-all flex flex-col group h-full cursor-pointer"
                  >
                    <div className="relative h-52 sm:h-56 w-full bg-[#0A0A0A] overflow-hidden shrink-0">
                      {thumb ? (
                        <RemoteImage src={thumb} alt={item.title ?? ''} className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
                      ) : (
                        // No thumbnail for a video: show the first frame.
                        <video src={item.media.url} muted preload="metadata" className="w-full h-full object-cover" />
                      )}

                      <div className="absolute top-3 left-3 z-10 pointer-events-none">
                        <span className="text-xs font-black uppercase tracking-wider bg-black/75 backdrop-blur-md text-white px-3 py-1 rounded-md border border-white/15 flex items-center gap-1.5 shadow-sm">
                          {item.platforms.length === 1 ? platformIcon(item.platforms[0], 'w-3 h-3') : <Layers className="w-3 h-3 text-amber-400" />}
                          <span>{portfolioPlatformLabel(item.platforms)}</span>
                        </span>
                      </div>

                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <div className="w-12 h-12 rounded-full bg-white text-[#0A0A0A] flex items-center justify-center shadow-lg">
                          <Play className="w-5 h-5 fill-current translate-x-0.5" />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between bg-white">
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-sm text-[#0A0A0A] line-clamp-1 leading-snug">{item.title}</h3>

                          <div onClick={(e) => e.stopPropagation()}>
                            <Dropdown
                              menu={{
                                items: [
                                  { key: 'edit', icon: <Edit3 className="w-4 h-4" />, label: 'Edit Work', onClick: () => openEditModal(item) },
                                  ...(platformFilter === 'all' && portfolioList.length > 1
                                    ? [
                                        { key: 'left', icon: <ArrowLeft className="w-4 h-4" />, label: 'Move earlier', disabled: index === 0, onClick: () => void handleMove(index, -1) },
                                        { key: 'right', icon: <ArrowRight className="w-4 h-4" />, label: 'Move later', disabled: index === portfolioList.length - 1, onClick: () => void handleMove(index, 1) },
                                      ]
                                    : []),
                                  { type: 'divider' as const },
                                  {
                                    key: 'delete',
                                    icon: <Trash2 className="w-4 h-4" />,
                                    label: 'Delete Work',
                                    danger: true,
                                    onClick: () =>
                                      Modal.confirm({
                                        title: 'Delete Work',
                                        content: `Remove "${item.title}" from your portfolio?`,
                                        okText: 'Delete',
                                        okType: 'danger',
                                        cancelText: 'Cancel',
                                        onOk: () => handleDelete(item),
                                      }),
                                  },
                                ],
                              }}
                              trigger={['click']}
                              placement="bottomRight"
                            >
                              <button
                                type="button"
                                className="w-9 h-9 -mr-1.5 -mt-1.5 flex items-center justify-center rounded-lg text-[#66665E] hover:text-[#0A0A0A] hover:bg-[#FAFAF8] transition-colors cursor-pointer shrink-0"
                                title="Work options"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </Dropdown>
                          </div>
                        </div>

                        {(item.deliverableType || item.brandName) && (
                          <div className="text-xs text-[#66665E] font-medium line-clamp-1">
                            {[item.brandName, item.deliverableType].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Film className="w-8 h-8 text-[#66665E]" />}
              title={portfolioList.length ? 'No work on this platform' : 'No work yet'}
              description="Upload your creative projects so brands can see what you make."
              primaryAction={portfolioList.length ? undefined : { label: 'Add First Work', onClick: openAddModal, icon: <Plus className="w-4 h-4" /> }}
            />
          )}
        </div>
      </div>

      {/* Add / edit modal */}
      <Modal
        title={<h2 className="text-xl font-bold text-[#0A0A0A] tracking-tight pb-1">{editingItemId ? 'Edit Work' : 'Add Work'}</h2>}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={540}
        centered
        destroyOnClose
        className="rounded-xl"
      >
        <div className="py-2 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">
              Media <span className="text-rose-500">*</span>
            </label>

            <input ref={mediaInputRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" className="hidden" onChange={handleMediaPicked} />

            {isUploading ? (
              <div className="rounded-lg border border-[#E7E7E2] bg-[#FAFAF8] h-44 flex flex-col items-center justify-center gap-2 text-sm font-bold text-[#66665E]">
                <Loader2 className="w-6 h-6 animate-spin" />
                Uploading…
              </div>
            ) : previewUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-[#E7E7E2] bg-[#0A0A0A] h-44 flex items-center justify-center group shadow-inner">
                {mediaInfo.mediaType === 'video' && !previewUrl.match(/\.(png|jpe?g|webp|gif|avif)(\?|$)/i) ? (
                  <video src={previewUrl} muted className="w-full h-full object-cover opacity-90" />
                ) : (
                  <RemoteImage src={previewUrl} alt="Work preview" className="w-full h-full object-cover opacity-90" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                  <Button
                    type="default"
                    onClick={() => mediaInputRef.current?.click()}
                    className="h-9 px-4 rounded-lg text-sm font-semibold bg-white text-[#0A0A0A] border-none flex items-center gap-1.5 shadow-md"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Change Media</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => mediaInputRef.current?.click()}
                className="border-2 border-dashed border-[#D2D2CA] hover:border-[#0A0A0A] rounded-lg p-6 text-center cursor-pointer transition-all bg-[#FAFAF8] hover:bg-[#F5F5F0] space-y-1.5 group"
              >
                <div className="w-10 h-10 rounded-lg bg-white border border-[#E7E7E2] group-hover:border-[#0A0A0A] flex items-center justify-center mx-auto text-[#0A0A0A] shadow-2xs">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="text-sm font-bold text-[#0A0A0A]">Click to upload image or video</div>
                <p className="text-xs text-[#66665E]">MP4, MOV, WEBM, PNG, JPG — up to 300 MB</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">
                Work Title <span className="text-rose-500">*</span>
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="e.g. Dewy Hydration Routine"
                className="rounded-lg h-10 font-semibold text-base sm:text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">Platform</label>
              <Select
                mode="multiple"
                value={selectedPlatforms.length === ALL_PLATFORMS.length ? [...selectedPlatforms, 'all'] : selectedPlatforms}
                onChange={handlePlatformsChange}
                tagRender={tagRender}
                className="w-full min-h-[42px]"
                placeholder="Select platforms..."
                menuItemSelectedIcon={<Check className="w-4 h-4 text-[#0A0A0A] stroke-[3]" />}
                options={[...ALL_PLATFORMS, 'all'].map((p) => ({
                  value: p,
                  label: (
                    <div className="flex items-center gap-2">
                      {platformIcon(p, 'w-4 h-4')}
                      <span className="font-semibold text-sm">{p === 'all' ? 'All platforms' : PLATFORM_LABEL[p]}</span>
                    </div>
                  ),
                }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">Brand</label>
              <Input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                maxLength={100}
                placeholder="e.g. Laneige (empty = Personal Work)"
                className="rounded-lg h-10 font-semibold text-base sm:text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">Format</label>
              <Input
                value={deliverableType}
                onChange={(e) => setDeliverableType(e.target.value)}
                maxLength={60}
                placeholder="e.g. 60s Reel, Story Series"
                className="rounded-lg h-10 font-semibold text-base sm:text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">Description</label>
            <Input.TextArea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder="Describe the work"
              className="rounded-lg p-3 text-base sm:text-sm border-[#E7E7E2] leading-relaxed"
            />
          </div>

          <div className="pt-2 border-t border-[#E7E7E2] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-2.5">
            <Button onClick={() => setIsModalOpen(false)} className="rounded-lg h-11 sm:h-10 px-5 font-semibold text-sm border-[#E7E7E2]">
              Cancel
            </Button>
            <Button
              type="primary"
              onClick={() => void handleSave()}
              loading={isCreating || isUpdating}
              disabled={isUploading}
              className="rounded-lg h-11 sm:h-10 px-6 font-semibold text-sm bg-[#0A0A0A] hover:!bg-zinc-800 !text-white border-none shadow-xs cursor-pointer"
            >
              {editingItemId ? 'Update Work' : 'Save Work'}
            </Button>
          </div>
        </div>
      </Modal>

      {previewingItem && (
        <PortfolioVideoModal
          item={previewingItem}
          creator={{
            name: currentUser?.name ?? '',
            handle: creatorProfile?.handle,
            avatar: currentUser?.avatar,
            verified: creatorProfile?.verified,
          }}
          onClose={() => setPreviewingItem(null)}
          onEdit={(item) => openEditModal(item)}
        />
      )}
    </div>
  );
}

/** Portfolio UI; `items` come from the server page (GET /me/portfolio). */
export function PortfolioView({ items }: { items: PortfolioItem[] | null }) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-bold text-[#66665E]">Loading portfolio...</div>}>
      <CreatorPortfolioContent items={items} />
    </Suspense>
  );
}
