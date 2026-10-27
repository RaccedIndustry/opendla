import { getJson, type Archive } from '#lib/api.ts';
import type { PageLoad } from './$types';

/** One CLIN of a day's RFQs, as GET /api/archives/:id/lines lists it. */
type Line = {
	id: number;
	solicitationId: number;
	number: string;
	clin: string;
	nomenclature: string | null;
	nsn: string | null;
	quantity: number | null;
	unit: string | null;
	quoteDueDate: string | null;
	deliveryDays: number | null;
	setAside: string | null;
	amsc: string | null;
	controlled: boolean;
	firstArticle: boolean;
	office: string | null;
	buyer: string | null;
	fob: string | null;
	cages: string | null;
	lastPrice: number | null;
	lastQuantity: number | null;
	lastCage: string | null;
	lastAwardDate: string | null;
	lastSurplus: boolean | null;
};

/** One page of lines, how many match, and each filter's values. */
type Lines = { total: number; rows: Line[]; options: Record<string, unknown[]> };

export const load: PageLoad = async ({ fetch, url }) => {
	const archives = await getJson<Archive[]>(fetch, '/api/archives');
	// The newest parsed archive (parsed ones have the RFQs) unless the URL picks one.
	const archive =
		Number(url.searchParams.get('archive')) ||
		(archives.find((a) => a.state === 'parsed') ?? archives[0])?.id;
	const q = url.searchParams.get('q') ?? '';
	// The rest of the URL is the table's (q, page, size and the filters), and the API reads it as is.
	const params = new URLSearchParams(url.search);
	params.delete('archive');
	const lines: Lines = archive
		? await getJson<Lines>(fetch, `/api/archives/${archive}/lines?${params}`)
		: { total: 0, rows: [], options: {} };
	return { archives, archive, q, lines };
};
