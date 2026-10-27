<script lang="ts">
	import type { Item } from '#lib/api.ts';

	/** Who DLA accepts the part from. */
	let { sources }: { sources: Item['approved_sources'] } = $props();
</script>

<section>
	<h3>Approved sources</h3>
	{#if sources.length}
		<div>
			<table>
				<thead>
					<tr><th>Company</th><th>CAGE</th><th>Part number</th></tr>
				</thead>
				<tbody>
					{#each sources as s, i (i)}
						<tr><td>{s.name}</td><td>{s.cage}</td><td>{s.part_number}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p>None listed.</p>
	{/if}
</section>
