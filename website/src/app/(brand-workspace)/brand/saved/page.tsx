import { serverApi } from '@/lib/api/server';
import { publicEndpoints } from '@/lib/api/endpoints/public';
import { SavedView } from './SavedView';

const PAGE_SIZE = 24;

/**
 * Server page: loads the brand's shortlist (GET /me/saved-creators) before render, so the cards are
 * in the first HTML. The session/role check already happened in the workspace layout.
 * A failed request renders the view's "Couldn't load" state instead of crashing.
 */
export default async function BrandSavedShortlistPage({ searchParams }: { searchParams: { page?: string } }) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const data = await publicEndpoints(serverApi())
    .savedCreators({ page, limit: PAGE_SIZE })
    .catch(() => null);

  return <SavedView data={data} page={page} pageSize={PAGE_SIZE} />;
}
