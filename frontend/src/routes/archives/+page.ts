import { getJson, type Archive } from '#lib/api.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const [archives, status] = await Promise.all([
		getJson<Archive[]>(fetch, '/api/archives'),
		getJson<{ lastCheck: { at: string; error?: string } | null }>(fetch, '/api/archives/status')
	]);
	return { archives, lastCheck: status.lastCheck };
};
