<script lang="ts">
	import { tick } from 'svelte';
	import type { Rfq } from '#lib/api.ts';
	import { download } from '#lib/export.ts';
	import RfqAwards from './RfqAwards.svelte';
	import RfqContact from './RfqContact.svelte';
	import RfqFacts from './RfqFacts.svelte';
	import RfqLines from './RfqLines.svelte';
	import RfqNotes from './RfqNotes.svelte';
	import RfqRequirements from './RfqRequirements.svelte';
	import RfqSources from './RfqSources.svelte';

	/** One RFQ laid out for a quoting vendor: bid/no-bid facts and prices first, fine print last. */
	let { rfq }: { rfq: Rfq } = $props();

	// ponytail: shows items[0] only, as every RFQ in the corpus has one item; flatten items if that changes
	const item = $derived(rfq.data.items[0]);
	const nsn = $derived(item.nsn ?? item.clins[0]?.nsn);
	const json = $derived(JSON.stringify(rfq, null, 2));

	let raw = $state(false);
	let copied = $state('');
	let pre = $state<HTMLPreElement>();

	async function copy() {
		try {
			await navigator.clipboard.writeText(json);
			copied = 'Copied';
		} catch {
			// No Clipboard API outside a secure context, e.g. a plain-HTTP LAN install: copy the selection.
			raw = true;
			await tick();
			if (pre) getSelection()?.selectAllChildren(pre);
			copied = document.execCommand('copy') ? 'Copied' : 'Press Ctrl+C / ⌘C';
		}
		setTimeout(() => (copied = ''), 2000);
	}

	/** The PDF as DIBBS posted it, which the server keeps with the day's files. */
	async function pdf() {
		const res = await fetch(`/api/solicitations/${rfq.id}/pdf`);
		if (!res.ok) return alert(`Couldn't download the PDF (${res.status})`);
		download(await res.blob(), `${rfq.number}.pdf`);
	}
</script>

<header>
	<h2 id="rfq-title">{rfq.number}</h2>
	{#if rfq.sha256}<button type="button" onclick={pdf}>Download PDF</button>{/if}
	<button type="button" onclick={() => (raw = !raw)}>{raw ? 'Hide JSON' : 'Raw JSON'}</button>
	<button type="button" onclick={copy} aria-live="polite">{copied || 'Copy JSON'}</button>
	<form method="dialog"><button>Close</button></form>
</header>

{#if raw}
	<pre bind:this={pre}>{json}</pre>
{:else}
	<div class="rfq">
		<p class="item">{item.description}{#if nsn}<span>{' · '}NSN {nsn}</span>{/if}</p>
		<RfqFacts {rfq} />
		<RfqLines clins={item.clins} />
		<RfqSources sources={item.approved_sources} />
		<RfqAwards awards={rfq.awards} />
		<RfqRequirements {item} firstArticle={rfq.data.first_article} />
		<RfqContact buyer={rfq.data.buyer} office={rfq.data.issuing_office} />
		<RfqNotes {item} notes={rfq.data.notes} clauses={rfq.data.clauses} />
	</div>
{/if}

<style>
	/* Sticks over the dialog's 1.25rem padding, so the actions stay in reach while scrolling. */
	header {
		position: sticky;
		top: -1.25rem;
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: -1.25rem -1.25rem 1rem;
		padding: 1.25rem 1.25rem 0.75rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}
	h2 {
		margin: 0 auto 0 0;
		font-size: 1rem;
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.item {
		font-size: 1rem;
		font-weight: 600;
	}
	.item span {
		color: var(--muted);
		font-weight: 400;
	}

	/* The look shared by the section components. */
	.rfq :global(:is(h3, p, ul, dl)) {
		margin: 0;
	}
	.rfq :global(section) {
		margin-top: 1.5rem;
	}
	.rfq :global(:is(section, details) > * + *) {
		margin-top: 0.5rem;
	}
	.rfq :global(h3) {
		color: var(--muted);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.rfq :global(dl) {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: 0.75rem 1.5rem;
	}
	.rfq :global(dt) {
		color: var(--muted);
		font-size: 0.75rem;
	}
	.rfq :global(dd) {
		margin: 0;
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	.rfq :global(ul) {
		padding-left: 1.25rem;
	}
	.rfq :global(li + li) {
		margin-top: 0.25rem;
	}
	.rfq :global(summary) {
		cursor: pointer;
		font-weight: 500;
	}
	.rfq :global(.num) {
		text-align: right;
	}
	.rfq :global(dd small) {
		display: block;
		color: var(--muted);
		font-size: 0.75rem;
		font-weight: 400;
	}
	.rfq :global(:is(.warn, .warn small)) {
		color: var(--danger);
	}
</style>
