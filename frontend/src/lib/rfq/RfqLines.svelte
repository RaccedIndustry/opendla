<script lang="ts">
	import type { Clin } from '#lib/api.ts';

	/** The CLINs: what gets quoted, how many, by when and where to. */
	let { clins }: { clins: Clin[] } = $props();
</script>

<section>
	<h3>Lines</h3>
	<div>
		<table>
			<thead>
				<tr>
					<th>CLIN</th>
					<th>NSN</th>
					<th class="num">Qty</th>
					<th>Unit</th>
					<th class="num">Delivery (days)</th>
					<th>RDD</th>
					<th>FOB</th>
					<th>Inspection / acceptance</th>
					<th>Ship to</th>
					<th>PR</th>
				</tr>
			</thead>
			<tbody>
				{#each clins as c (c.clin)}
					{@const to = c.ship_to?.freight ?? c.ship_to?.parcel_post}
					<tr>
						<td>{c.clin}</td>
						<td>{c.nsn}</td>
						<td class="num">{c.quantity?.toLocaleString('en-US')}</td>
						<td>{c.unit}</td>
						<td class="num">{c.delivery_days_ado}</td>
						<td>{c.rdd}</td>
						<td>{c.fob}</td>
						<td>
							{c.inspection_point === c.acceptance_point
								? c.inspection_point
								: `${c.inspection_point} / ${c.acceptance_point}`}
						</td>
						<!-- DoDAAC and city are enough to judge freight; the full address shows on hover. -->
						<td title={to?.lines.join('\n')}>
							{to
								? [to.dodaac, [to.city, to.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
								: ''}
						</td>
						<td>{c.pr}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
