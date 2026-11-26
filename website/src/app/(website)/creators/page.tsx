import type { Metadata } from 'next';
import { publicApi, tryPublic } from '@/lib/api/server';
import { publicEndpoints } from '@/lib/api/endpoints/public';
import { metaEndpoints } from '@/lib/api/endpoints/meta';
import { labelize } from '@/components/shared/creatorFormat';
import { CREATORS_PAGE_SIZE, parseCreatorFilters, toCreatorApiParams, toUrlSearchParams } from './creatorQuery';
import { CreatorsView } from './CreatorsView';

type Props = { searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ searchParams }: Props): Metadata {
  const filters = parseCreatorFilters(toUrlSearchParams(searchParams));
  const category = filters.category !== 'all' ? labelize(filters.category) : '';
  const platform = filters.platform !== 'all' ? labelize(filters.platform) : '';
  const subject = [category, 'Creators', platform ? `on ${platform}` : ''].filter(Boolean).join(' ');
  return {
    title: `Discover ${subject} | Influverse`,
    description: 'Find the right creators to bring your brand to life — across all platforms and niches.',
    alternates: { canonical: '/creators' },
  };
}

/**
 * /creators discovery. The server renders the results for the URL's filters (page included) through the
 * cached public client, so the first HTML has the creator cards. Filter / page changes update the URL,
 * which re-renders this page. No cookies / session here.
 */
export default async function CreatorsDiscoveryPage({ searchParams }: Props) {
  const filters = parseCreatorFilters(toUrlSearchParams(searchParams));
  const [data, meta] = await Promise.all([
    publicEndpoints(publicApi)
      .searchCreators(toCreatorApiParams(filters, CREATORS_PAGE_SIZE))
      .catch(() => null),
    tryPublic((api) => metaEndpoints(api).options()),
  ]);

  return <CreatorsView data={data} creatorCategories={meta?.creatorCategories ?? []} pageSize={CREATORS_PAGE_SIZE} />;
}
