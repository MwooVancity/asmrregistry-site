import type { APIRoute } from 'astro';
import { search } from '../lib/search';

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q') || '';
  const intent = url.searchParams.get('intent');
  const trigger = url.searchParams.get('trigger');
  const duration_min = url.searchParams.get('duration_min');
  const duration_max = url.searchParams.get('duration_max');
  const sort = url.searchParams.get('sort') as 'relevance' | 'views' | 'date' | 'authority' | null;
  const page = parseInt(url.searchParams.get('page') || '1', 10);

  const results = await search(q, {
    intent: intent || undefined,
    trigger: trigger || undefined,
    duration_min: duration_min ? parseInt(duration_min, 10) : undefined,
    duration_max: duration_max ? parseInt(duration_max, 10) : undefined,
    sort: sort || 'relevance',
  });

  return new Response(
    JSON.stringify({
      query: q,
      filters: { intent, trigger, duration_min, duration_max, sort },
      page,
      per_page: 50,
      total_results: results.length,
      results,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
