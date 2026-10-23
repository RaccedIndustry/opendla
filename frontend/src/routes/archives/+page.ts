import { getJson, type Archive } from '#lib/api.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => ({
	archives: await getJson<Archive[]>(fetch, '/api/archives')
});
