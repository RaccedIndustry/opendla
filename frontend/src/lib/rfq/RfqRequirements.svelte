<script lang="ts">
	import type { Item, Rfq } from '#lib/api.ts';

	/** What the part must meet: first article, drawings and specs, DLA requirement codes, packaging. */
	let { item, firstArticle: fa }: { item: Item; firstArticle: Rfq['data']['first_article'] } =
		$props();

	// A code can repeat with slightly different text; one line per code is enough.
	const codes = $derived([
		...new Map(item.requirement_codes.map((c) => [c.code, c.text])).entries()
	]);
</script>

{#if fa}
	<section>
		<h3>First article</h3>
		<dl>
			<div><dt>Testing</dt><dd>{fa.testing}</dd></div>
			<div><dt>Quantity</dt><dd>{fa.quantity}</dd></div>
			{#if fa.due_days_after_award !== null}
				<div><dt>Due</dt><dd>{fa.due_days_after_award} days after award</dd></div>
			{/if}
			{#if fa.govt_decision_days !== null}
				<div><dt>Government decision</dt><dd>within {fa.govt_decision_days} days</dd></div>
			{/if}
			{#if fa.lot_item}<div><dt>Lot / item</dt><dd>{fa.lot_item}</dd></div>{/if}
			{#if fa.ship_to}<div><dt>Ship to</dt><dd>{fa.ship_to}</dd></div>{/if}
		</dl>
	</section>
{/if}

{#if item.reference_docs.length}
	<section>
		<h3>Reference documents</h3>
		<div>
			<table>
				<thead>
					<tr>
						<th>Type</th>
						<th>Number</th>
						<th>Rev</th>
						<th>Date</th>
						<th>CAGE</th>
						<th>Part number</th>
					</tr>
				</thead>
				<tbody>
					{#each item.reference_docs as r, i (i)}
						<tr>
							<td>{r.type}</td>
							<td>{r.number}</td>
							<td>{r.revision}</td>
							<td>{r.date}</td>
							<td>{r.cage}</td>
							<td>{r.part_number}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}

{#if codes.length}
	<section>
		<h3>Requirement codes</h3>
		<ul>
			{#each codes as [code, text] (code)}<li><b>{code}</b> {text}</li>{/each}
		</ul>
	</section>
{/if}

{#each item.clins as c (c.clin)}
	{#if c.packaging}
		<section>
			<h3>Packaging, CLIN {c.clin}</h3>
			<dl>
				{#if c.packaging.standard}<div><dt>Standard</dt><dd>{c.packaging.standard}</dd></div>{/if}
				{#each Object.entries(c.packaging.codes) as [k, v] (k)}<div><dt>{k}</dt><dd>{v}</dd></div>{/each}
			</dl>
			{#if c.packaging.instructions.length}
				<ul>
					{#each c.packaging.instructions as t, i (i)}<li>{t}</li>{/each}
				</ul>
			{/if}
		</section>
	{/if}
{/each}
