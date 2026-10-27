<script lang="ts">
	import { usd, type Award } from '#lib/api.ts';

	/** Past awards for the NSN, newest first: the price reference. */
	let { awards }: { awards: Award[] } = $props();
</script>

<section>
	<h3>Award history ({awards.length})</h3>
	{#if awards.length}
		<div>
			<table>
				<thead>
					<tr>
						<th>Date</th>
						<th class="num">Unit price</th>
						<th class="num">Qty</th>
						<th>Awardee CAGE</th>
						<th>Contract</th>
						<th>Surplus</th>
					</tr>
				</thead>
				<tbody>
					{#each awards as a (a.id)}
						<tr>
							<td>{a.awardDate}</td>
							<td class="num">{usd.format(a.unitPrice)}</td>
							<td class="num">{a.quantity.toLocaleString('en-US')}</td>
							<td>{a.cage ?? 'Not found'}</td>
							<td>{a.contract}</td>
							<td>{a.surplus ? 'Yes' : ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p>None on record.</p>
	{/if}
</section>
