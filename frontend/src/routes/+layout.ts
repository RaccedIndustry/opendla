import { redirect } from '@sveltejs/kit';
import type { LayoutLoadEvent } from './$types';

export const ssr = false;

// Reading `url` reruns this on every navigation, so an expired session is caught.
// (So `pathname` is read up front, not only after a 401.)
export async function load({ fetch, url: { pathname } }: LayoutLoadEvent) {
	const res = await fetch('/api/auth/me');
	if (res.status === 401 && pathname !== '/login') redirect(307, '/login');
	const user: { id: number; username: string } | null = res.ok ? await res.json() : null;
	return { user };
}
