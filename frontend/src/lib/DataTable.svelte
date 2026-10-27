<script lang="ts" generics="T extends { id: number }">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page as route } from '$app/state';
	import { csv, download, text, xlsx } from '#lib/export.ts';

	type Key = keyof T & string;

	let {
		rows,
		columns,
		searchable = true,
		filename,
		toolbar,
		cell,
		server
	}: {
		rows: T[];
		/** Up to 5 columns marked `filter` get a dropdown. */
		columns: { key: Key; label: string; filter?: boolean }[];
		/** Off when the page runs its own search, e.g. on the server. */
		searchable?: boolean;
		/** Export file name without the extension; the page's path by default, e.g. "archives". */
		filename?: string;
		/** Extra controls at the start of the toolbar row. */
		toolbar?: Snippet;
		/** Custom cell content; `text` is the default to fall back on. */
		cell?: Snippet<[row: T, key: Key, text: string]>;
		/**
		 * Paged and filtered on the server: `rows` is the page the URL asks for, `options` lists each filter's
		 * values, and `all` fetches every matching row for export (nothing after showing its own error).
		 */
		server?: { total: number; options: Record<string, unknown[]>; all: () => Promise<T[] | void> };
	} = $props();

	const SIZES = [10, 25, 50, 100];

	// The page, rows per page and filters live in the URL, so a link or Back shows the same rows, and a
	// server-side table's load function can pass them on. A new archive or server search drops them with its
	// GET form; a refresh after an edit keeps them.
	const params = $derived(route.url.searchParams);
	const size = $derived(Number(params.get('size')) || 25);
	const page = $derived(Math.max(1, Number(params.get('page')) || 1) - 1);
	const filters = $derived(columns.filter((c) => c.filter).slice(0, 5));
	const picked = $derived(Object.fromEntries(filters.map((c) => [c.key, params.get(c.key) ?? ''])));
	let search = $state('');

	/** Opens this view with `changes` in the URL ('' removes a param), keeping the scroll and focus. */
	function go(changes: Record<string, string | number>) {
		const url = new URL(route.url.href);
		for (const [k, v] of Object.entries(changes)) {
			if (v === '') url.searchParams.delete(k);
			else url.searchParams.set(k, String(v));
		}
		// Typing a search on page 1 changes nothing, so it doesn't navigate on every keystroke.
		if (url.href !== route.url.href) goto(url, { reset: false });
	}
	/** Page 1 keeps the URL clean. */
	const to = (n: number) => go({ page: n ? n + 1 : '' });

	// Each filter's values as [value in the URL, label]: the server's, or the distinct ones in `rows`.
	// Booleans go in the URL as true/false and read Yes/No. The picked one stays listed when the rows
	// change, so it can be cleared.
	const options = $derived(
		Object.fromEntries(
			filters.map((c) => {
				const values = new Map(picked[c.key] ? [[picked[c.key], picked[c.key]]] : []);
				for (const v of server ? (server.options[c.key] ?? []) : rows.map((r) => r[c.key])) {
					if (text(v)) values.set(String(v), text(v));
				}
				return [c.key, [...values].sort(([a], [b]) => (a < b ? -1 : 1))];
			})
		)
	);
	const shown = $derived.by(() => {
		if (server) return rows;
		const q = search.trim().toLowerCase();
		return rows.filter(
			(r) =>
				filters.every((c) => !picked[c.key] || String(r[c.key]) === picked[c.key]) &&
				(!q || columns.some((c) => text(r[c.key]).toLowerCase().includes(q)))
		);
	});
	const count = $derived(server?.total ?? shown.length);
	const pages = $derived(Math.max(1, Math.ceil(count / size)));
	// Clamped: a refresh can leave fewer pages, e.g. after deleting the last row. The server clamps the same way.
	const current = $derived(Math.min(page, pages - 1));
	const visible = $derived(server ? rows : shown.slice(current * size, (current + 1) * size));

	/** Every row the search and filters let through, not just this page. */
	async function exportAs(ext: 'csv' | 'xlsx') {
		const all = server ? await server.all() : shown;
		if (!all) return;
		const table = [columns.map((c) => c.label), ...all.map((r) => columns.map((c) => r[c.key]))];
		const blob = ext === 'csv' ? new Blob([csv(table)], { type: 'text/csv' }) : await xlsx(table);
		download(blob, `${filename ?? location.pathname.slice(1)}.${ext}`);
	}

	// Which sides have columns out of view, for the edge fades and the scroll buttons.
	let scroller: HTMLDivElement;
	let moreLeft = $state(false);
	let moreRight = $state(false);
	function track(el: HTMLDivElement) {
		scroller = el;
		const update = () => {
			moreLeft = el.scrollLeft > 0;
			moreRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
		};
		const observer = new ResizeObserver(update);
		observer.observe(el);
		observer.observe(el.firstElementChild!); // the table, which widens and narrows with the page shown
		el.addEventListener('scroll', update, { passive: true });
		return () => {
			observer.disconnect();
			el.removeEventListener('scroll', update);
		};
	}
	// Most of a screen, so a few columns of the last view stay in sight.
	const nudge = (dir: 1 | -1) => scroller.scrollBy({ left: dir * 0.8 * scroller.clientWidth });
</script>

<div class="toolbar">
	{@render toolbar?.()}
	{#if searchable}
		<input
			type="search"
			placeholder="Search"
			aria-label="Search"
			bind:value={search}
			oninput={() => to(0)}
		/>
	{/if}
	{#each filters as c (c.key)}
		<label>
			{c.label}
			<select value={picked[c.key]} onchange={(e) => go({ [c.key]: e.currentTarget.value, page: '' })}>
				<option value="">All</option>
				{#each options[c.key] as [value, label] (value)}<option {value}>{label}</option>{/each}
			</select>
		</label>
	{/each}
	<span class="export" title="Exports every row that matches ({count.toLocaleString()}), not just this page">
		<button type="button" disabled={!count} onclick={() => exportAs('csv')}>Export CSV</button>
		<button type="button" disabled={!count} onclick={() => exportAs('xlsx')}>Export XLSX</button>
	</span>
</div>

<div class="frame" class:left={moreLeft} class:right={moreRight}>
	<div {@attach track}>
		<table>
			<thead>
				<tr>
					{#each columns as c (c.key)}<th>{c.label}</th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each visible as row (row.id)}
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
	{#if moreLeft}
		<button type="button" class="nudge left" aria-label="Scroll left" onclick={() => nudge(-1)}>‹</button>
	{/if}
	{#if moreRight}
		<button type="button" class="nudge right" aria-label="Scroll right" onclick={() => nudge(1)}>›</button>
	{/if}
</div>

{#if count > SIZES[0]}
	<div class="pager">
		<span role="status">
			{(current * size + 1).toLocaleString()}–{Math.min((current + 1) * size, count).toLocaleString()}
			of {count.toLocaleString()}
		</span>
		<label class="size">
			Rows per page
			<select value={size} onchange={(e) => go({ size: e.currentTarget.value, page: '' })}>
				{#each SIZES as n (n)}<option value={n}>{n}</option>{/each}
			</select>
		</label>
		<!-- One group, so the arrows wrap together on phones. -->
		<span class="nav">
			<button type="button" aria-label="First page" disabled={current === 0} onclick={() => to(0)}
				>«</button
			>
			<button
				type="button"
				aria-label="Previous page"
				disabled={current === 0}
				onclick={() => to(current - 1)}>‹</button
			>
			Page {current + 1} of {pages.toLocaleString()}
			<button
				type="button"
				aria-label="Next page"
				disabled={current === pages - 1}
				onclick={() => to(current + 1)}>›</button
			>
			<button
				type="button"
				aria-label="Last page"
				disabled={current === pages - 1}
				onclick={() => to(pages - 1)}>»</button
			>
		</span>
	</div>
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
	.export {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}

	.frame {
		position: relative;
	}
	/* Fades on the sides with columns out of view, 1px in so the table's border stays crisp. */
	.frame::before,
	.frame::after {
		content: '';
		position: absolute;
		inset-block: 1px;
		width: 3rem;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.frame::before {
		left: 1px;
		border-radius: 7px 0 0 7px;
		background: linear-gradient(to right, var(--surface), transparent);
	}
	.frame::after {
		right: 1px;
		border-radius: 0 7px 7px 0;
		background: linear-gradient(to left, var(--surface), transparent);
	}
	.frame.left::before,
	.frame.right::after {
		opacity: 1;
	}
	/* Round ‹ › buttons on the header row. */
	.nudge {
		position: absolute;
		top: 0.25rem;
		z-index: 1;
		width: 1.75rem;
		min-height: 1.75rem;
		padding: 0;
		border-radius: 50%;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
		font-size: 1rem;
		line-height: 1;
	}
	.nudge.left {
		left: 0.375rem;
	}
	.nudge.right {
		right: 0.375rem;
	}
	@media (prefers-reduced-motion: no-preference) {
		.frame > div {
			scroll-behavior: smooth;
		}
	}

	.pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
		color: var(--muted);
	}
	.size {
		margin-left: auto;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
</style>
