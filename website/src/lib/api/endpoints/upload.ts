import type { ApiClient } from '../types';
import { idempotencyKey } from '../core';

/** Upload contexts a brand / creator may use (server/src/app/modules/upload/upload.constant.ts). */
export type UploadContext =
  | 'avatar' // images, 10 MB
  | 'brand_logo' // images, 8 MB
  | 'cover' // images, 15 MB
  | 'gallery' // images, 20 MB
  | 'portfolio' // images + video, 300 MB
  | 'verification_sample' // private
  | 'deliverable' // private
  | 'chat_attachment' // private
  | 'order_attachment' // private
  | 'ticket_attachment'; // private

interface PresignResult {
  fileId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  publicUrl: string | null;
}

export interface UploadedFile {
  id: string;
  context: string;
  name: string;
  mime: string;
  size: number;
  visibility: 'public' | 'private';
  /** Public files only. Private files need GET /files/:id/url. */
  url: string | null;
}

/** Reads image width/height in the browser (sent to the server so it can store media info). */
const imageSize = (file: File) =>
  new Promise<{ width?: number; height?: number }>((resolve) => {
    if (!file.type.startsWith('image/')) return resolve({});
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

export const uploadEndpoints = (c: ApiClient) => ({
  presign: (body: { context: UploadContext; fileName: string; mime: string; sizeBytes: number }) =>
    c.post<PresignResult>('/uploads/presign', body, { headers: { 'Idempotency-Key': idempotencyKey() } }),
  complete: ({ id, ...body }: { id: string; width?: number; height?: number; durationSec?: number }) =>
    c.post<UploadedFile>(`/uploads/${id}/complete`, body),
  /** Signed URL for a private file. */
  fileUrl: (id: string, signal?: AbortSignal) => c.get<{ url: string; expiresIn: number | null }>(`/files/${id}/url`, { signal }),
});

/**
 * Upload one file in three steps (browser only; pass the `http` client):
 * 1. ask the server for a presigned S3 URL, 2. PUT the file straight to S3, 3. confirm with the server.
 * Use the returned `id` as `fileId` in later requests, and `url` for public images (avatar, logo, cover…).
 */
export const uploadFileWith = async (
  c: ApiClient,
  file: File,
  context: UploadContext,
  onProgress?: (percent: number) => void,
): Promise<UploadedFile> => {
  const api = uploadEndpoints(c);
  const signed = await api.presign({ context, fileName: file.name, mime: file.type, sizeBytes: file.size });
  await new Promise<void>((resolve, reject) => {
    // XHR (not fetch) so large portfolio videos can report progress.
    const xhr = new XMLHttpRequest();
    xhr.open(signed.method || 'PUT', signed.uploadUrl);
    for (const [k, v] of Object.entries(signed.headers ?? {})) xhr.setRequestHeader(k, v);
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed. Please try again.')));
    xhr.onerror = () => reject(new Error('Upload failed. Please try again.'));
    xhr.send(file);
  });
  return api.complete({ id: signed.fileId, ...(await imageSize(file)) });
};
