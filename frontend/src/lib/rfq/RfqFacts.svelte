<script lang="ts">
	import { usd, type Rfq } from '#lib/api.ts';

	/** What decides bid or no-bid, at a glance. Facts without a value are left out. */
	let { rfq }: { rfq: Rfq } = $props();

	const TYPES: Record<string, string> = {
		T: 'Automated',
		U: 'Automated, indefinite delivery',
		Q: 'Manual'
	};
	// Any code but N means set aside. Only Y's meaning is confirmed so far (docs/ARCHITECTURE.md).
	const SET_ASIDES: Record<string, string> = { N: 'No', Y: 'Small business' };
	const inDays = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

	// Whole days from today to the due date: both dates parse as UTC midnight.
	const daysLeft = $derived(
		rfq.quoteDueDate === null
			? null
			: Math.round(
					(Date.parse(rfq.quoteDueDate) - Date.parse(new Date().toLocaleDateString('en-CA'))) /
						864e5
				)
	);

	// A short value, with the details in a muted line under it.
	type Fact = [label: string, value: string | null, note?: string | null, warn?: boolean];
	const facts = $derived.by((): Fact[] => {
		const { solicitation: s, first_article: fa, warranty_months } = rfq.data;
		const last = rfq.awards[0];
		return [
			[
				'Due',
				rfq.quoteDueDate,
				daysLeft === null ? null : inDays.format(daysLeft, 'day'),
				daysLeft !== null && daysLeft <= 2
			],
			last
				? [
						'Last award',
						`${usd.format(last.unitPrice)} × ${last.quantity.toLocaleString('en-US')}`,
						[last.cage, last.awardDate, last.surplus && 'surplus'].filter(Boolean).join(' · ')
					]
				: ['Last award', 'None on record'],
			['Set-aside', rfq.setAside && (SET_ASIDES[rfq.setAside] ?? `Yes (${rfq.setAside})`)],
			fa
				? [
						'First article',
						'Yes',
						[fa.testing && `${fa.testing.toLowerCase()} testing`, fa.quantity && `${fa.quantity} units`]
							.filter(Boolean)
							.join(' · ')
					]
				: ['First article', 'No'],
			[
				'Controlled',
				rfq.controlled ? 'Yes' : 'No',
				rfq.controlled ? 'CUI or export-controlled data' : null,
				rfq.controlled
			],
			['Type', TYPES[rfq.type] ? `${TYPES[rfq.type]} (${rfq.type})` : rfq.type],
			['AMSC', rfq.amsc],
			['DPAS', s.dpas_rating],
			['NAICS', s.naics],
			['Quote validity', s.quote_validity_days === null ? null : `${s.quote_validity_days} days`],
			['Warranty', warranty_months === null ? null : `${warranty_months} months`],
			['Issued', rfq.issueDate]
		];
	});
</script>

<section>
	<dl>
		{#each facts as [label, value, note, warn] (label)}
			{#if value}
				<div>
					<dt>{label}</dt>
					<dd class:warn>{value}{#if note}<small>{note}</small>{/if}</dd>
				</div>
			{/if}
		{/each}
	</dl>
</section>
