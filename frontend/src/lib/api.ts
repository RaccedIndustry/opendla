import { error, redirect } from '@sveltejs/kit';

export type Archive = {
	id: number;
	date: string;
	fileUrl: string;
	state: 'pending' | 'downloaded' | 'parsed';
	demo: boolean;
	/** What the last download or parse skipped, and why. */
	errors: { file: string; error: string }[] | null;
};

/** DLA unit prices run to 5 decimals. */
export const usd = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	maximumFractionDigits: 5
});

type Address = { dodaac: string; lines: string[]; city: string | null; state: string | null };

/** One CLIN of the parser's JSON: the unit a vendor quotes. */
export type Clin = {
	clin: string;
	nsn: string | null;
	quantity: number | null;
	unit: string | null;
	fob: string | null;
	inspection_point: string | null;
	acceptance_point: string | null;
	delivery_days_ado: number | null;
	rdd: string | null;
	pr: string | null;
	packaging: { standard: string | null; codes: Record<string, string>; instructions: string[] } | null;
	ship_to: { freight: Address | null; parcel_post: Address | null } | null;
	notes: string[];
};

/** The item of the parser's JSON. Every RFQ has exactly one. */
export type Item = {
	nsn: string | null;
	description: string | null;
	approved_sources: { name: string; cage: string; part_number: string }[];
	reference_docs: {
		type: string | null;
		number: string;
		revision: string | null;
		date: string | null;
		cage: string | null;
		part_number: string | null;
	}[];
	requirement_codes: { code: string; text: string }[];
	notes: string[];
	clins: Clin[];
};

export type Award = {
	id: number;
	nsn: string;
	awardDate: string;
	contract: string;
	/** null when DIBBS prints "NOT FOUND". */
	cage: string | null;
	quantity: number;
	unitPrice: number;
	surplus: boolean;
};

/**
 * GET /api/solicitations/:id: the stored RFQ, the parser's whole JSON (`data`) and every award on record
 * for its NSNs, newest first. Only the fields the detail view shows are typed.
 */
export type Rfq = {
	id: number;
	number: string;
	/** T or U: DIBBS automated (U = indefinite delivery); Q: manual. */
	type: string;
	issueDate: string | null;
	/** From the daily index: a re-posted RFQ keeps its old date in the PDF. */
	quoteDueDate: string | null;
	setAside: string | null;
	amsc: string | null;
	controlled: boolean;
	data: {
		solicitation: {
			dpas_rating: string | null;
			naics: string | null;
			quote_validity_days: number | null;
		};
		issuing_office: { lines: string[] } | null;
		buyer: { name: string | null; code: string | null; phone: string | null; email: string | null } | null;
		items: Item[];
		first_article: {
			testing: string | null;
			quantity: number | null;
			lot_item: string | null;
			due_days_after_award: number | null;
			govt_decision_days: number | null;
			ship_to: string | null;
		} | null;
		warranty_months: number | null;
		notes: string[];
		clauses: { number: string; title: string; date: string; alt?: string; deviation?: string }[];
	};
	awards: Award[];
};

/** GET JSON inside a load function: 401 goes to the login page, other failures to the error page. */
export async function getJson<T>(fetch: typeof globalThis.fetch, path: string): Promise<T> {
	const res = await fetch(path);
	if (res.status === 401) redirect(307, '/login');
	if (!res.ok) error(res.status);
	return res.json();
}
