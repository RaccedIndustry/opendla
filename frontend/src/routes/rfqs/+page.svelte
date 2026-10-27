<script lang="ts">
	import { usd, type Rfq } from '#lib/api.ts';
	import DataTable from '#lib/DataTable.svelte';
	import RfqDetail from '#lib/rfq/RfqDetail.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let dialog = $state<HTMLDialogElement>();
	let detail = $state<Rfq>();
	const archive = $derived(data.archives.find((a) => a.id === data.archive));

	// The latest award on record for the line's NSN, with what qualifies the price.
	const rows = $derived(
		data.lines.map((l) => ({
			...l,
			lastAward:
				l.lastPrice === null
					? ''
					: [
							`${usd.format(l.lastPrice)} × ${l.lastQuantity}`,
							l.lastCage,
							l.lastAwardDate,
							l.lastSurplus && 'surplus'
						]
							.filter(Boolean)
							.join(' · ')
		}))
	);

	/** Opens the whole RFQ: everything parsed from it and every award on record for its NSNs. */
	async function show(id: number) {
		const res = await fetch(`/api/solicitations/${id}`);
		if (!res.ok) return alert(`Couldn't load the RFQ (${res.status})`);
		detail = await res.json();
		dialog?.showModal();
	}
</script>

<h1>RFQs {#if archive?.demo}<mark>demo</mark>{/if}</h1>

{#if data.archives.length === 0}
	<p>No archives yet. The daily job adds one per DIBBS post date.</p>
{:else}
	<DataTable
		{rows}
		searchable={false}
		filename="rfqs-{archive?.date}"
		columns={[
			{ key: 'number', label: 'Solicitation' },
			{ key: 'clin', label: 'CLIN' },
			{ key: 'nomenclature', label: 'Item' },
			{ key: 'nsn', label: 'NSN' },
			{ key: 'quantity', label: 'Qty' },
			{ key: 'unit', label: 'Unit' },
			{ key: 'quoteDueDate', label: 'Due', filter: true },
			{ key: 'deliveryDays', label: 'Days' },
			{ key: 'setAside', label: 'Set-aside', filter: true },
			{ key: 'amsc', label: 'AMSC' },
			{ key: 'cages', label: 'Approved sources' },
			{ key: 'lastAward', label: 'Last award' },
			{ key: 'controlled', label: 'Controlled', filter: true },
			{ key: 'firstArticle', label: 'First article', filter: true },
			{ key: 'office', label: 'Office', filter: true },
			{ key: 'buyer', label: 'Buyer' },
			{ key: 'fob', label: 'FOB' }
		]}
	>
		{#snippet toolbar()}
			<!-- A GET form: Kit turns it into a client-side navigation, so the URL holds the archive and search. -->
			<form class="search" data-sveltekit-reset="false">
				<select
					name="archive"
					aria-label="Archive"
					value={data.archive}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				>
					{#each data.archives as a (a.id)}
						<option value={a.id}>{a.date} · {a.state}{a.demo ? ' · demo' : ''}</option>
					{/each}
				</select>
				<input
					type="search"
					name="q"
					value={data.q}
					placeholder="Search all RFQ text"
					aria-label="Search all RFQ text"
				/>
				<button>Search</button>
			</form>
		{/snippet}
		{#snippet cell(line, key, text)}
			{#if key === 'number'}<button onclick={() => show(line.solicitationId)}>{text}</button
				>{:else}{text}{/if}
		{/snippet}
	</DataTable>
{/if}

<!-- Keyed, so each RFQ opens on the formatted view. -->
<dialog bind:this={dialog} aria-labelledby="rfq-title">
	{#if detail}{#key detail}<RfqDetail rfq={detail} />{/key}{/if}
</dialog>

<style>
	.search {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
