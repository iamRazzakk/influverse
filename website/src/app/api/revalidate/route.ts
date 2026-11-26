import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

/**
 * On-demand cache refresh, called by the server's `revalidate` worker job
 * (server/src/jobs/revalidate.processor.ts) after CMS / creator / brand data changes.
 *
 * Body: `{ tags: string[] }`, e.g. ["cms:faqs"], ["creators", "creator:sophiekim"], ["brand:aura"].
 * Header `x-revalidate-secret` must equal REVALIDATE_SECRET (same value as the server's WEBSITE_REVALIDATE_SECRET).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get('x-revalidate-secret') !== secret) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  let tags: unknown;
  try {
    ({ tags } = await request.json());
  } catch {
    return NextResponse.json({ success: false, message: 'Malformed JSON body' }, { status: 400 });
  }

  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string' && tag.length <= 200)) {
    return NextResponse.json({ success: false, message: '`tags` must be an array of strings' }, { status: 400 });
  }

  for (const tag of tags as string[]) revalidateTag(tag);
  return NextResponse.json({ success: true, message: 'Revalidated', data: { tags } });
}
