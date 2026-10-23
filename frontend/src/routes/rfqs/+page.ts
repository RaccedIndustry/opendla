import { getJson, type Archive } from '#lib/api.ts';
import type { PageLoad } from './$types';

type Rfq = {
	id: number;
	number: string;
	quoteDueDate: string | null;
	setAside: boolean | null;
	office: string | null;
	buyer: string | null;
	nsn: string | null;
	item: string | null;
	quantity: number | null;
	unit: string | null;
	fob: string | null;
};

export const load: PageLoad = async ({ fetch, url }) => {
	const archives = await getJson<Archive[]>(fetch, '/api/archives');
	// The newest archive unless the URL picks one.
	const archive = Number(url.searchParams.get('archive')) || archives[0]?.id;
	const q = url.searchParams.get('q') ?? '';
	const rfqs = archive
		? await getJson<Rfq[]>(fetch, `/api/archives/${archive}/rfqs?${new URLSearchParams({ q })}`)
		: [];
	return { archives, archive, q, rfqs };
};
