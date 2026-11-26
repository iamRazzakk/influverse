import { redirect } from 'next/navigation';
import { serverApi } from '@/lib/api/server';
import { studioEndpoints } from '@/lib/api/endpoints/studio';
import { PortfolioView } from './PortfolioView';

/**
 * Server page: loads the creator's portfolio (GET /me/portfolio) before render.
 * A failed request → `null` → the view's "Couldn't load" state.
 */
export default async function CreatorPortfolioPage({ searchParams }: { searchParams: { tab?: string } }) {
  // Old links to the gallery tab now live on the profile page.
  if (searchParams.tab === 'photos' || searchParams.tab === 'gallery') redirect('/creator/profile?tab=gallery');

  const items = await studioEndpoints(serverApi()).portfolio().catch(() => null);
  return <PortfolioView items={items} />;
}
