'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, X, Camera, RefreshCw, Loader2 } from 'lucide-react';
import { message } from 'antd';
import { http } from '@/lib/api/client';
import { uploadFileWith, type UploadContext } from '@/lib/api/endpoints/upload';
import { getErrorMessage } from '@/lib/api/errors';
import { RemoteImage } from '@/components/shared/RemoteImage';

interface ImageUploadProps {
  /** Current public image URL. */
  value?: string;
  /** Called with the uploaded file's public URL ('' when removed). */
  onChange: (url: string) => void;
  /** Where the file is stored on S3 — decides size/type limits on the server. */
  context?: Extract<UploadContext, 'avatar' | 'brand_logo' | 'cover' | 'gallery'>;
  label?: string;
  description?: string;
  variant?: 'standard' | 'avatar' | 'banner';
  className?: string;
  aspectRatio?: string;
  maxSizeMb?: number;
}

export function ImageUpload({
  value,
  onChange,
  label,
  description = 'PNG, JPG, WEBP up to 10MB',
  variant = 'standard',
  className = '',
  aspectRatio,
  maxSizeMb = 10,
  context = 'avatar',
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('Please upload an image file (PNG, JPG, WEBP, SVG).');
      return;
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      message.error(`File size exceeds ${maxSizeMb}MB limit.`);
      return;
    }

    // Upload straight to S3 (presigned URL) and hand back the public URL.
    setIsUploading(true);
    uploadFileWith(http, file, context)
      .then((uploaded) => {
        if (!uploaded.url) throw new Error('Upload did not return a public URL');
        onChange(uploaded.url);
        message.success('Image uploaded');
      })
      .catch((err) => message.error(getErrorMessage(err, 'Upload failed. Please try again.')))
      .finally(() => setIsUploading(false));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleClick = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 1. AVATAR / PROFILE VARIANT
  // Shown on top of the drop area while the file uploads.
  const uploadingOverlay = isUploading && (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 rounded-[inherit]">
      <Loader2 className="w-5 h-5 animate-spin text-[#0A0A0A]" />
    </div>
  );

  if (variant === 'avatar') {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        <div
          onClick={handleClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative w-20 h-20 rounded-full border-2 cursor-pointer transition-all overflow-hidden flex items-center justify-center shrink-0 shadow-md ${
            isDragging
              ? 'border-[#0A0A0A] bg-zinc-100 scale-105 ring-4 ring-black/10'
              : 'border-[#E7E7E2] hover:border-[#0A0A0A] bg-[#FAFAF8]'
          }`}
        >
          {uploadingOverlay}
          {value ? (
            <>
              <RemoteImage src={value} alt="Avatar" className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
              <div
                className={`absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center gap-1 transition-opacity ${
                  isHovered || isDragging ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <Camera className="w-5 h-5" />
                <span className="text-sm font-bold">Change</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-[#66665E] p-2 text-center">
              <Camera className="w-6 h-6 mb-1 text-[#0A0A0A]" />
              <span className="text-xs font-bold uppercase">Upload</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5 flex-1 min-w-0">
          {label && <div className="text-sm font-bold text-[#0A0A0A]">{label}</div>}
          <div className="text-sm text-[#66665E]">{description}</div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleClick}
              className="h-10 px-3.5 rounded-lg bg-[#0A0A0A] hover:bg-zinc-800 text-white text-sm font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{value ? 'Upload New' : 'Choose Image'}</span>
            </button>
            {value && (
              <button
                type="button"
                onClick={handleRemove}
                className="h-10 px-3 rounded-lg bg-[#F4F4F0] hover:bg-rose-100 text-[#66665E] hover:text-rose-600 text-sm font-semibold transition-all cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. BANNER / WIDE COVER VARIANT
  if (variant === 'banner') {
    return (
      <div className={`space-y-2 ${className}`}>
        {label && (
          <label className="text-xs font-bold uppercase tracking-wider text-[#66665E] block">
            {label}
          </label>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative w-full h-44 sm:h-52 rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden flex flex-col items-center justify-center text-center p-6 ${
            isDragging
              ? 'border-[#0A0A0A] bg-zinc-100 scale-[1.01]'
              : value
              ? 'border-[#E7E7E2] hover:border-[#0A0A0A] bg-black'
              : 'border-[#D2D2CA] hover:border-[#0A0A0A] bg-[#FAFAF8] hover:bg-[#F4F4F0]'
          }`}
        >
          {uploadingOverlay}
          {value ? (
            <>
              <RemoteImage src={value} alt="Cover Banner" className="w-full h-full object-cover opacity-90" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex flex-wrap items-end justify-between gap-2 p-3 sm:p-4 text-white">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-sm font-bold truncate">Cover Banner Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClick();
                    }}
                    className="h-10 px-3 rounded-lg bg-white/90 hover:bg-white text-[#0A0A0A] text-sm font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Change</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemove}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-black/60 hover:bg-rose-600 text-white transition-all cursor-pointer"
                    title="Remove Cover"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2 pointer-events-none">
              <div className="w-12 h-12 rounded-lg bg-white border border-[#E7E7E2] text-[#0A0A0A] flex items-center justify-center mx-auto shadow-2xs">
                <UploadCloud className="w-6 h-6 text-[#0A0A0A]" />
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-[#0A0A0A]">
                  Click to upload cover image or drag & drop
                </div>
                <div className="text-sm text-[#66665E] font-medium">{description}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. STANDARD / GALLERY DROPZONE VARIANT
  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="text-xs font-bold uppercase tracking-wider text-[#66665E] block">
          {label}
        </label>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
          }
        }}
      />

      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative w-full rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden flex flex-col items-center justify-center text-center p-6 ${
          aspectRatio ? aspectRatio : 'min-h-[180px]'
        } ${
          isDragging
            ? 'border-[#0A0A0A] bg-zinc-100 scale-[1.01]'
            : value
            ? 'border-[#E7E7E2] bg-white'
            : 'border-[#D2D2CA] hover:border-[#0A0A0A] bg-[#FAFAF8] hover:bg-[#F4F4F0]'
        }`}
      >
        {uploadingOverlay}
        {value ? (
          <div className="relative w-full h-full min-h-[180px] flex items-center justify-center group">
            <img
              src={value}
              alt="Uploaded Media"
              className="max-h-56 w-auto max-w-full rounded-md object-contain shadow-sm"
            />
            <div className="absolute top-2 right-2 flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick();
                }}
                className="h-10 px-3 rounded-lg bg-white/95 hover:bg-white text-[#0A0A0A] text-sm font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer border border-[#E7E7E2]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Replace</span>
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-all cursor-pointer shadow-md"
                title="Remove Image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pointer-events-none">
            <div className="w-12 h-12 rounded-lg bg-white border border-[#E7E7E2] text-[#0A0A0A] flex items-center justify-center mx-auto shadow-2xs">
              <UploadCloud className="w-6 h-6 text-[#0A0A0A]" />
            </div>
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-[#0A0A0A]">
                Click to browse or drag & drop image
              </div>
              <div className="text-sm text-[#66665E] font-medium">{description}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
