'use client';

import React from 'react';
import { http } from '@/lib/api/client';
import { uploadEndpoints } from '@/lib/api/endpoints/upload';
import { useRequest } from '@/lib/hooks/useRequest';

/** A stored file reference; private files have `url = /files/:id/url` and need a short-lived signed URL. */
export interface StoredFile {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
}

const isPrivateUrl = (url: string) => url.startsWith('/files/');

/** Signed (10 min) URL for a private file, or the public URL as-is. `undefined` while loading. */
export function usePrivateFileUrl(file: StoredFile): string | undefined {
  const privateFile = isPrivateUrl(file.url);
  const { data } = useRequest((signal) => uploadEndpoints(http).fileUrl(file.id, signal), [file.id], {
    skip: !privateFile || !file.id,
  });
  return privateFile ? data?.url : file.url;
}

export const isVideoFile = (file: { mime: string; name: string }) =>
  file.mime.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);

export const formatFileSize = (bytes: number) =>
  bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** `<video>` for a private file (renders nothing until the signed URL is ready). */
export function PrivateVideo({ file, className }: { file: StoredFile; className?: string }) {
  const src = usePrivateFileUrl(file);
  if (!src) return null;
  return <video src={src} controls className={className} />;
}

/** Download / open link for a private file; inert text until the signed URL is ready. */
export function PrivateFileLink({
  file,
  className,
  children,
}: {
  file: StoredFile;
  className?: string;
  children: React.ReactNode;
}) {
  const href = usePrivateFileUrl(file);
  if (!href) return <span className={`${className ?? ''} opacity-60`}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
