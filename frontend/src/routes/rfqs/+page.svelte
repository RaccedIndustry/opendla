<script lang="ts">
	import DataTable from '#lib/DataTable.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let dialog = $state<HTMLDialogElement>();
	let detail = $state<{ number: string; data: unknown }>();

	async function show(id: number) {
		const res = await fetch(`/api/rfqs/${id}`);
		if (!res.ok) return alert(`Couldn't load the RFQ (${res.status})`);
		detail = await res.json();
		dialog?.showModal();
	}
</script>

<h1>RFQs</h1>

{#if data.archives.length === 0}
	<p>No archives yet. The daily job adds one per DIBBS post date.</p>
{:else}
	<DataTable
		rows={data.rfqs}
		searchable={false}
		columns={[
			{ key: 'number', label: 'Number' },
			{ key: 'item', label: 'Item' },
			{ key: 'nsn', label: 'NSN' },
			{ key: 'quantity', label: 'Qty' },
			{ key: 'unit', label: 'Unit' },
			{ key: 'quoteDueDate', label: 'Due', filter: true },
			{ key: 'setAside', label: 'Set-aside', filter: true },
			{ key: 'office', label: 'Office', filter: true },
			{ key: 'buyer', label: 'Buyer', filter: true },
			{ key: 'fob', label: 'FOB', filter: true }
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
					{#each data.archives as a (a.id)}<option value={a.id}>{a.date} · {a.state}</option>{/each}
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
		{#snippet cell(rfq, key, text)}
			{#if key === 'number'}<button onclick={() => show(rfq.id)}>{text}</button>{:else}{text}{/if}
		{/snippet}
	</DataTable>
{/if}

<dialog bind:this={dialog} aria-labelledby="rfq-title">
	<header>
		<h2 id="rfq-title">{detail?.number}</h2>
		<form method="dialog"><button>Close</button></form>
	</header>
	<pre>{JSON.stringify(detail?.data, null, 2)}</pre>
</dialog>

<style>
	.search {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	h2 {
		margin: 0;
		font-size: 1rem;
	}
	pre {
		max-height: 70vh;
		overflow: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
