<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import DataTable from '#lib/DataTable.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let error = $state('');
	let adding = $state(false);
	let started = $state(false);

	const STATES = ['pending', 'downloaded', 'parsed'];

	const rows = $derived(
		data.archives.map((a) => ({ ...a, file: a.fileUrl.split('/').pop() ?? '' }))
	);

	/** Sends a change; shows the API's message if it fails, reloads the list if it worked. */
	async function send(method: string, path: string, body?: object) {
		const res = await fetch(path, {
			method,
			headers: body && { 'content-type': 'application/json' },
			body: body && JSON.stringify(body)
		});
		error = res.ok ? '' : ((await res.json().catch(() => null))?.message ?? `Failed (${res.status})`);
		if (res.ok) await refreshAll();
		return res.ok;
	}

	// The server checks the date against DIBBS's list, which takes a second or two.
	async function add(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
		e.preventDefault();
		const form = e.currentTarget;
		adding = true;
		try {
			if (await send('POST', '/api/archives', Object.fromEntries(new FormData(form)))) form.reset();
		} finally {
			adding = false;
		}
	}

	async function setState(id: number, select: HTMLSelectElement, was: string) {
		// A one-way `value` doesn't snap back by itself when the server refuses the change.
		if (!(await send('PATCH', `/api/archives/${id}`, { state: select.value }))) select.value = was;
	}

	async function run() {
		started = await send('POST', '/api/archives/run');
	}
</script>

<h1>Archives</h1>
<p>
	One row per DIBBS daily archive. Click a date to see its RFQs, or add a day the job missed. Set a
	row back to pending to download it again, or to downloaded to parse it again. Rows tagged demo hold
	sample RFQs: the job skips them, and adding the real day replaces them.
</p>
<!-- A vendor whose network DIBBS blocks must find out here, not from missing days. -->
<p role={data.lastCheck?.error ? 'alert' : 'status'}>
	Last DIBBS check:
	{#if data.lastCheck}
		{new Date(data.lastCheck.at).toLocaleString()} · {data.lastCheck.error ?? 'OK'}
	{:else}
		none since the server started
	{/if}
</p>
{#if error}
	<p role="alert">{error}</p>
{:else if started}
	<p role="status">Job started. Reload in a few minutes to see the new states.</p>
{/if}

<DataTable
	{rows}
	columns={[
		{ key: 'date', label: 'Date' },
		{ key: 'file', label: 'File' },
		{ key: 'state', label: 'State', filter: true },
		{ key: 'errors', label: 'Errors' }
	]}
>
	{#snippet toolbar()}
		<form class="add" onsubmit={add}>
			<input type="date" name="date" aria-label="Archive date" required />
			<button disabled={adding}>{adding ? 'Checking DIBBS…' : 'Add date'}</button>
		</form>
		<button type="button" onclick={run}>Run job now</button>
	{/snippet}
	{#snippet cell(archive, key, text)}
		{#if key === 'date'}<a href="/rfqs?archive={archive.id}">{text}</a>
			{#if archive.demo}<mark>demo</mark>{/if}
		{:else if key === 'state'}
			<select
				aria-label="State of {archive.date}"
				value={archive.state}
				disabled={archive.demo}
				onchange={(e) => setState(archive.id, e.currentTarget, archive.state)}
			>
				{#each STATES as s (s)}<option>{s}</option>{/each}
			</select>
		{:else if key === 'errors'}
			{#if archive.errors}
				<details>
					<summary>{archive.errors.length}</summary>
					<ul>
						{#each archive.errors as e, i (i)}<li>{e.file}: {e.error}</li>{/each}
					</ul>
				</details>
			{/if}
		{:else}{text}{/if}
	{/snippet}
</DataTable>

<style>
	.add {
		display: flex;
		gap: 0.5rem;
	}
</style>
