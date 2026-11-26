import { baseApi, unwrap, type ApiEnvelope } from './baseApi';

/** Upload contexts an admin is allowed to use (server/src/app/modules/upload/upload.constant.ts). */
export type AdminUploadContext = 'avatar' | 'cms_asset' | 'chat_attachment' | 'ticket_attachment';

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
  url: string | null;
}

const uploadApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    presignUpload: build.mutation<PresignResult, { context: AdminUploadContext; fileName: string; mime: string; sizeBytes: number }>({
      query: (body) => ({
        url: '/admin/uploads/presign',
        method: 'POST',
        body,
        // The presign route is idempotent: a retried click won't create two file rows.
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
      transformResponse: (r: ApiEnvelope<PresignResult>) => unwrap(r),
    }),
    completeUpload: build.mutation<UploadedFile, { id: string; width?: number; height?: number }>({
      query: ({ id, ...body }) => ({ url: `/admin/uploads/${id}/complete`, method: 'POST', body }),
      transformResponse: (r: ApiEnvelope<UploadedFile>) => unwrap(r),
    }),
  }),
});

/**
 * Hook that uploads one file in three steps:
 * 1. ask the server for a presigned S3 URL, 2. PUT the file straight to S3, 3. tell the server it is done.
 * Returns the stored file (public files have a `url` you can save on the record).
 */
export const useUploadFile = () => {
  const [presign] = uploadApi.usePresignUploadMutation();
  const [complete] = uploadApi.useCompleteUploadMutation();

  return async (file: File, context: AdminUploadContext): Promise<UploadedFile> => {
    const signed = await presign({ context, fileName: file.name, mime: file.type, sizeBytes: file.size }).unwrap();
    const put = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.headers, body: file });
    if (!put.ok) throw new Error('Upload to storage failed. Please try again.');
    return complete({ id: signed.fileId }).unwrap();
  };
};
