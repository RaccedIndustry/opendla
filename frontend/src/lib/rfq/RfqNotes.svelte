<script lang="ts">
	import type { Item, Rfq } from '#lib/api.ts';

	/** The fine print, collapsed: about 40 notes and 60 clauses per RFQ, mostly boilerplate. */
	let { item, notes, clauses }: { item: Item; notes: string[]; clauses: Rfq['data']['clauses'] } =
		$props();

	// The item's own notes first, then the CLINs' and the solicitation's; "-------" rules dropped.
	const all = $derived(
		[
			...item.notes,
			...item.clins.flatMap((c) => c.notes.map((n) => `CLIN ${c.clin}: ${n}`)),
			...notes
		].filter((n) => !/^[-\s]*$/.test(n))
	);
</script>

<section>
	<h3>Notes and clauses</h3>
	<details>
		<summary>Notes ({all.length})</summary>
		<ul>
			{#each all as n, i (i)}<li>{n}</li>{/each}
		</ul>
	</details>
	<details>
		<summary>Clauses ({clauses.length})</summary>
		<ul>
			{#each clauses as c, i (i)}
				<li>
					<b>{c.number}{c.alt ? ` Alt ${c.alt}` : ''}</b>
					{c.title} ({c.date}){c.deviation ? `, deviation ${c.deviation}` : ''}
				</li>
			{/each}
		</ul>
	</details>
</section>
