import { getJson } from '#lib/api.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => ({
	users: await getJson<{ id: number; username: string }[]>(fetch, '/api/users')
});
