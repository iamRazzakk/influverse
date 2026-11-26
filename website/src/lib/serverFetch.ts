import 'server-only';
import { tryPublic } from './api/server';

/**
 * Fetch public API data inside Server Components (SEO pages: home, legal, creator / brand profiles).
 * Thin wrapper over `publicApi` (lib/api/server.ts), kept so existing pages don't change.
 * New code can use `publicApi` + an `endpoints/*` factory directly.
 *
 * `tags` must match the tags the server sends to POST /api/revalidate, so pages refresh as soon as
 * the data changes:
 *   cms:page:<slug> · cms:faqs · cms:partner-brands · cms:site · creators · creator:<handle> · brand:<slug>
 * `revalidate` is only a safety net in case a revalidate call is missed.
 *
 * Returns `null` on 404 or network failure so the page can render a fallback / notFound().
 */
export async function serverFetch<T>(
  path: string,
  { tags = [], revalidate = 300 }: { tags?: string[]; revalidate?: number } = {},
): Promise<T | null> {
  const data = await tryPublic((api) => api.get<T>(path, { tags, revalidate }));
  return data ?? null;
}
