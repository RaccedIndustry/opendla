<script lang="ts" generics="T extends { id: number }">
	import type { Snippet } from 'svelte';

	type Key = keyof T & string;

	let {
		rows,
		columns,
		searchable = true,
		toolbar,
		cell
	}: {
		rows: T[];
		/** Up to 5 columns marked `filter` get a dropdown. */
		columns: { key: Key; label: string; filter?: boolean }[];
		/** Off when the page runs its own search, e.g. on the server. */
		searchable?: boolean;
		/** Extra controls at the start of the toolbar row. */
		toolbar?: Snippet;
		/** Custom cell content; `text` is the default to fall back on. */
		cell?: Snippet<[row: T, key: Key, text: string]>;
	} = $props();

	const LIMIT = 200; // ponytail: render cap instead of paging

	const text = (v: unknown) =>
		v == null ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);

	let search = $state('');
	let picked = $state<Record<string, string>>({});

	const filters = $derived(columns.filter((c) => c.filter).slice(0, 5));
	// Distinct values per filter. The picked one stays listed when the rows change, so it can be cleared.
	const options = $derived(
		Object.fromEntries(
			filters.map((c) => [
				c.key,
				[...new Set([...rows.map((r) => text(r[c.key])), picked[c.key] ?? ''])]
					.filter(Boolean)
					.sort()
			])
		)
	);
	const shown = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return rows.filter(
			(r) =>
				filters.every((c) => !picked[c.key] || text(r[c.key]) === picked[c.key]) &&
				(!q || columns.some((c) => text(r[c.key]).toLowerCase().includes(q)))
		);
	});
</script>

<div class="toolbar">
	{@render toolbar?.()}
	{#if searchable}
		<input type="search" placeholder="Search" aria-label="Search" bind:value={search} />
	{/if}
	{#each filters as c (c.key)}
		<label>
			{c.label}
			<select bind:value={picked[c.key]}>
				<option value="">All</option>
				{#each options[c.key] as o (o)}<option>{o}</option>{/each}
			</select>
		</label>
	{/each}
</div>

<div>
	<table>
		<thead>
			<tr>
				{#each columns as c (c.key)}<th>{c.label}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each shown.slice(0, LIMIT) as row (row.id)}
				<tr>
					{#each columns as c (c.key)}
						<td>
							{#if cell}{@render cell(row, c.key, text(row[c.key]))}{:else}{text(row[c.key])}{/if}
						</td>
					{/each}
				</tr>
			{:else}
				<tr><td colspan={columns.length}>Nothing found</td></tr>
			{/each}
		</tbody>
	</table>
</div>
{#if shown.length > LIMIT}
	<p>Showing {LIMIT} of {shown.length}. Narrow the search to see the rest.</p>
{/if}

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
</style>
