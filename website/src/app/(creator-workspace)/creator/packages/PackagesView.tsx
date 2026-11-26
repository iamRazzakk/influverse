'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { http } from '@/lib/api/client';
import { useMutation } from '@/lib/hooks/useMutation';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  PACKAGE_LIMITS,
  studioEndpoints,
  type CreatorPackage,
  type PackagePlatform,
  type UsageRights,
} from '@/lib/api/endpoints/studio';
import type { MetaOptions } from '@/types/api';
import { formatCents } from '@/lib/format';
import { getErrorMessage } from '@/lib/api/errors';
import {
  Plus,
  Package,
  Flame,
  Check,
  Clock,
  RotateCcw,
  Trash2,
  Edit3,
  Copy,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button, Modal, Input, InputNumber, Select, Switch, message, Popconfirm } from 'antd';

const CHANNEL_OPTIONS: { id: PackagePlatform; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'ugc', label: 'UGC Video' },
];

const iconButton =
  'w-10 h-10 rounded-lg bg-[#FAFAF8] hover:bg-[#EAEAE3] text-[#0A0A0A] border border-[#E7E7E2] flex items-center justify-center transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * Creator rate card — max 3 packages (the server enforces it with an atomic slot counter).
 * `initialPackages` / `meta` come from the server page (`null` = the request failed). Every write
 * goes through useMutation → router.refresh() → fresh props.
 */
export function PackagesView({ initialPackages, meta }: { initialPackages: CreatorPackage[] | null; meta: MetaOptions | null }) {
  const router = useRouter();
  const packages = initialPackages ?? [];
  const isLoading = false;
  const isError = initialPackages === null;
  const refetch = () => router.refresh();
  const studio = studioEndpoints(http);
  const createMutation = useMutation(studio.createPackage);
  const updateMutation = useMutation(studio.updatePackage);
  const deleteMutation = useMutation(studio.deletePackage);
  const duplicateMutation = useMutation(studio.duplicatePackage);
  const reorderMutation = useMutation(studio.reorderPackages);
  const isCreating = createMutation.loading;
  const isUpdating = updateMutation.loading;

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPkgId, setEditingPkgId] = useState<string | null>(null);

  // Form state. Price is edited in euros and sent to the server as cents.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<PackagePlatform[]>(['instagram']);
  const [priceEur, setPriceEur] = useState<number>(350);
  const [deliveryDays, setDeliveryDays] = useState<number>(4);
  const [revisions, setRevisions] = useState<number>(2);
  const [usageRights, setUsageRights] = useState<UsageRights>('organic_30d');
  const [inclusionsText, setInclusionsText] = useState('');
  const [isPopular, setIsPopular] = useState(false);

  const usageRightsOptions = (meta?.usageRights ?? ['organic_30d']).map((value) => ({
    value,
    label: meta?.usageRightsLabels?.[value] ?? value,
  }));

  const isSearching = Boolean(searchQuery.trim());
  const filteredPackages = packages.filter((pkg) => {
    if (!isSearching) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      pkg.title.toLowerCase().includes(q) ||
      (pkg.description ?? '').toLowerCase().includes(q) ||
      pkg.inclusions.some((i) => i.toLowerCase().includes(q))
    );
  });

  const atLimit = packages.length >= PACKAGE_LIMITS.maxPackages;

  const handleOpenAddModal = () => {
    if (atLimit) {
      message.warning(`You can have at most ${PACKAGE_LIMITS.maxPackages} packages. Edit or remove an existing one first.`);
      return;
    }
    setEditingPkgId(null);
    setTitle('');
    setDescription('');
    setSelectedChannels(['instagram']);
    setPriceEur(350);
    setDeliveryDays(4);
    setRevisions(2);
    setUsageRights('organic_30d');
    setInclusionsText('');
    setIsPopular(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (pkg: CreatorPackage) => {
    setEditingPkgId(pkg.id);
    setTitle(pkg.title);
    setDescription(pkg.description ?? '');
    setSelectedChannels(pkg.platforms);
    setPriceEur(pkg.priceCents / 100);
    setDeliveryDays(pkg.deliveryDays);
    setRevisions(pkg.revisions);
    setUsageRights(pkg.usageRights);
    setInclusionsText(pkg.inclusions.join('\n'));
    setIsPopular(pkg.popular);
    setIsModalOpen(true);
  };

  const handleDuplicatePackage = async (pkg: CreatorPackage) => {
    if (atLimit) {
      message.warning(`You can have at most ${PACKAGE_LIMITS.maxPackages} packages. Remove or edit an existing package first.`);
      return;
    }
    try {
      await duplicateMutation.run(pkg.id);
      message.success(`Duplicated "${pkg.title}"`);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleToggleActive = async (pkg: CreatorPackage, isActive: boolean) => {
    try {
      await updateMutation.run({ id: pkg.id, isActive });
      message.success(isActive ? 'Package is live on your profile' : 'Package hidden from brands');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  /** Swaps a package with its neighbour and saves the new order. */
  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= packages.length) return;
    const ids = packages.map((p) => p.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reorderMutation.run(ids);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleSavePackage = async () => {
    if (!title.trim()) {
      message.error('Please enter a package title.');
      return;
    }
    const priceCents = Math.round((priceEur || 0) * 100);
    if (priceCents < PACKAGE_LIMITS.minPriceCents || priceCents > PACKAGE_LIMITS.maxPriceCents) {
      message.error(
        `Price must be between ${formatCents(PACKAGE_LIMITS.minPriceCents)} and ${formatCents(PACKAGE_LIMITS.maxPriceCents)}.`,
      );
      return;
    }
    if (selectedChannels.length === 0) {
      message.error('Please select at least 1 channel for this package.');
      return;
    }

    const body = {
      title: title.trim(),
      description: description.trim() || undefined,
      platforms: selectedChannels,
      priceCents,
      deliveryDays,
      revisions,
      inclusions: inclusionsText
        .split('\n')
        .map((i) => i.trim())
        .filter(Boolean)
        .slice(0, PACKAGE_LIMITS.maxInclusions),
      usageRights,
      popular: isPopular,
    };

    try {
      if (editingPkgId) {
        await updateMutation.run({ id: editingPkgId, ...body });
        message.success('Package updated');
      } else {
        await createMutation.run(body);
        message.success('Package published to your rate card');
      }
      setIsModalOpen(false);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleDeletePackage = async (pkgId: string) => {
    try {
      await deleteMutation.run(pkgId);
      message.success('Package removed from your rate card.');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader
        title="Packages"
        subtitle="Pricing and deliverables."
        action={
          <Button
            type="primary"
            onClick={handleOpenAddModal}
            disabled={atLimit}
            title={atLimit ? `Maximum ${PACKAGE_LIMITS.maxPackages} packages` : undefined}
            className="h-10 px-5 rounded-lg font-bold text-sm bg-[#0A0A0A] hover:!bg-zinc-800 !text-white border-none flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Package</span>
          </Button>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div className="sm:bg-white sm:rounded-xl sm:p-6 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-5 sm:space-y-6">
          {/* Header: title + search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E7E7E2]">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Packages</h2>
              <p className="text-sm text-[#66665E] mt-0.5 font-medium">
                {packages.length}/{PACKAGE_LIMITS.maxPackages} packages. Hidden packages are not shown to brands.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#66665E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search packages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-white sm:bg-[#FAFAF8] border border-[#E7E7E2] text-base sm:text-sm font-semibold placeholder:text-[#66665E] focus:outline-none focus:border-[#0A0A0A] transition-colors"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#A3A39B]" />
            </div>
          ) : isError ? (
            <EmptyState
              icon={<Package className="w-8 h-8 text-[#66665E]" />}
              title="Could not load your packages"
              description="Please check your connection and try again."
              primaryAction={{ label: 'Retry', onClick: () => void refetch() }}
            />
          ) : filteredPackages.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
              {filteredPackages.map((pkg) => {
                const index = packages.indexOf(pkg);
                return (
                  <div
                    key={pkg.id}
                    className={`rounded-xl min-w-0 border p-4 sm:p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-md relative bg-white ${
                      pkg.popular ? 'border-[#0A0A0A] ring-1 ring-[#0A0A0A]' : 'border-[#E7E7E2] hover:border-[#0A0A0A]'
                    } ${pkg.isActive ? '' : 'opacity-70'}`}
                  >
                    {pkg.popular && (
                      <div className="absolute -top-3 left-6 bg-[#0A0A0A] text-white text-xs font-extrabold uppercase tracking-wider px-3 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                        <Flame className="w-3 h-3 text-amber-300" />
                        <span>Most Popular</span>
                      </div>
                    )}

                    <div className="space-y-3">
                      {/* Price + active toggle */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold text-[#66665E]">{formatCents(pkg.priceCents)}</div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-[#66665E]">
                          <span>{pkg.isActive ? 'Active' : 'Hidden'}</span>
                          <Switch size="small" checked={pkg.isActive} onChange={(v) => void handleToggleActive(pkg, v)} />
                        </label>
                      </div>

                      <div>
                        <h3 className="text-lg font-black text-[#0A0A0A] leading-snug tracking-tight break-words">{pkg.title}</h3>
                        {pkg.description && (
                          <p className="text-sm text-[#66665E] mt-1.5 line-clamp-2 leading-relaxed font-medium">
                            {pkg.description}
                          </p>
                        )}
                        <p className="text-xs text-[#8E8E87] mt-1 font-semibold">
                          {pkg.platforms.map((p) => CHANNEL_OPTIONS.find((c) => c.id === p)?.label ?? p).join(' • ')}
                        </p>
                      </div>

                      {pkg.inclusions.length > 0 && (
                        <div className="pt-3 border-t border-[#F4F4F0] space-y-1.5 text-xs">
                          {pkg.inclusions.slice(0, 4).map((inc, i) => (
                            <div key={i} className="flex items-center gap-2 text-[#52524E]">
                              <Check className="w-3 h-3 text-[#FF2D78] shrink-0" />
                              <span className="truncate font-medium">{inc}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Turnaround, revisions and actions */}
                    <div className="pt-4 mt-4 border-t border-[#E7E7E2] space-y-3">
                      <div className="flex items-center justify-between text-sm text-[#66665E] font-bold">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#66665E]" />
                          {pkg.deliveryDays}d turnaround
                        </span>
                        <span className="flex items-center gap-1">
                          <RotateCcw className="w-3.5 h-3.5 text-[#66665E]" />
                          {pkg.revisions} revisions
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        {!isSearching && packages.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleMove(index, -1)}
                              disabled={index === 0}
                              className={iconButton}
                              title="Move left"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleMove(index, 1)}
                              disabled={index === packages.length - 1}
                              className={iconButton}
                              title="Move right"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(pkg)}
                          className="flex-1 h-10 min-w-0 rounded-lg bg-[#0A0A0A] hover:bg-zinc-800 text-white text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDuplicatePackage(pkg)}
                          disabled={atLimit}
                          className={iconButton}
                          title="Duplicate"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <Popconfirm
                          title="Delete package"
                          description="Remove this package from your public rate card?"
                          onConfirm={() => handleDeletePackage(pkg.id)}
                          okText="Delete"
                          cancelText="Cancel"
                          okButtonProps={{ danger: true }}
                        >
                          <button
                            type="button"
                            className="w-10 h-10 rounded-lg bg-[#FAFAF8] hover:bg-rose-50 text-[#66665E] hover:text-rose-600 border border-[#E7E7E2] flex items-center justify-center transition-all cursor-pointer shrink-0"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </Popconfirm>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Package className="w-8 h-8 text-[#66665E]" />}
              title={packages.length ? 'No packages found' : 'No packages yet'}
              description={
                packages.length
                  ? 'No packages match your search.'
                  : 'Create a package to start receiving direct brand bookings.'
              }
              primaryAction={
                packages.length
                  ? undefined
                  : { label: 'Create Package', onClick: handleOpenAddModal, icon: <Plus className="w-4 h-4" /> }
              }
            />
          )}
        </div>
      </div>

      {/* Add / edit package modal */}
      <Modal
        title={
          <div className="pb-3 border-b border-[#E7E7E2]">
            <span className="text-2xl font-extrabold text-[#0A0A0A]">{editingPkgId ? 'Edit Package' : 'Create Package'}</span>
          </div>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={620}
        destroyOnClose
        className="rounded-xl"
      >
        <div className="space-y-4 pt-3 font-sans">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">Title</label>
            <Input
              placeholder="e.g. 1x Dedicated 4K Reel + 3x Stories"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              className="rounded-lg h-10 text-base sm:text-sm font-semibold"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">Channels</label>
              <span className="text-xs text-[#8E8E87]">Select one or multiple</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((ch) => {
                const isSelected = selectedChannels.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      if (!isSelected) return setSelectedChannels([...selectedChannels, ch.id]);
                      if (selectedChannels.length > 1) setSelectedChannels(selectedChannels.filter((c) => c !== ch.id));
                      else message.warning('A package must have at least 1 channel.');
                    }}
                    className={`px-3.5 py-2 rounded-lg text-sm font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-2xs'
                        : 'bg-[#FAFAF8] text-[#66665E] border-[#E7E7E2] hover:border-[#0A0A0A] hover:text-[#0A0A0A]'
                    }`}
                  >
                    <span>{ch.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">Rate (€)</label>
              <InputNumber
                min={PACKAGE_LIMITS.minPriceCents / 100}
                max={PACKAGE_LIMITS.maxPriceCents / 100}
                value={priceEur}
                onChange={(val) => setPriceEur(val ?? 0)}
                className="w-full rounded-lg h-10 text-sm font-bold flex items-center"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">Duration (Days)</label>
              <InputNumber
                min={PACKAGE_LIMITS.minDeliveryDays}
                max={PACKAGE_LIMITS.maxDeliveryDays}
                value={deliveryDays}
                onChange={(val) => setDeliveryDays(val ?? 1)}
                className="w-full rounded-lg h-10 text-sm font-bold flex items-center"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">Revisions</label>
              <InputNumber
                min={0}
                max={PACKAGE_LIMITS.maxRevisions}
                value={revisions}
                onChange={(val) => setRevisions(val ?? 0)}
                className="w-full rounded-lg h-10 text-sm font-bold flex items-center"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">Included Deliverables (one per line)</label>
            <Input.TextArea
              rows={3}
              value={inclusionsText}
              onChange={(e) => setInclusionsText(e.target.value)}
              className="rounded-lg text-base sm:text-sm font-medium"
              placeholder={'1x 60s Reel\n3x Story Links\nBrand Mention Tag'}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">Usage Rights</label>
            <Select
              value={usageRights}
              onChange={(v) => setUsageRights(v as UsageRights)}
              options={usageRightsOptions}
              className="w-full h-10"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">Description</label>
            <Input.TextArea
              rows={2}
              placeholder="Creative scope, angles, or content guidelines..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              className="rounded-lg text-base sm:text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-bold text-[#0A0A0A] cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isPopular}
              onChange={(e) => setIsPopular(e.target.checked)}
              className="w-4 h-4 rounded text-[#0A0A0A]"
            />
            <span>Highlight as &quot;Most Popular&quot;</span>
          </label>

          <div className="pt-3 border-t border-[#E7E7E2] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-2.5">
            <Button onClick={() => setIsModalOpen(false)} className="rounded-lg h-11 sm:h-10 px-5 font-bold">
              Cancel
            </Button>
            <Button
              type="primary"
              onClick={() => void handleSavePackage()}
              loading={isCreating || isUpdating}
              className="h-11 sm:h-10 px-6 rounded-lg font-bold bg-[#0A0A0A] hover:!bg-zinc-800 !text-white border-none shadow-sm cursor-pointer"
            >
              {editingPkgId ? 'Save Changes' : 'Publish Package'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
