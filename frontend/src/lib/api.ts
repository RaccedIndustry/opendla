import { error, redirect } from '@sveltejs/kit';

export type Archive = {
	id: number;
	date: string;
	fileUrl: string;
	state: 'pending' | 'downloaded' | 'parsed';
	demo: boolean;
};

/** GET JSON inside a load function: 401 goes to the login page, other failures to the error page. */
export async function getJson<T>(fetch: typeof globalThis.fetch, path: string): Promise<T> {
	const res = await fetch(path);
	if (res.status === 401) redirect(307, '/login');
	if (!res.ok) error(res.status);
	return res.json();
}
