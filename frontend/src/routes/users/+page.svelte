<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import DataTable from '#lib/DataTable.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let error = $state('');

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

	async function add(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
		e.preventDefault();
		const form = e.currentTarget;
		if (await send('POST', '/api/users', Object.fromEntries(new FormData(form)))) form.reset();
	}
</script>

<h1>Users</h1>

<form class="add" onsubmit={add}>
	<input name="username" placeholder="Username" aria-label="New username" autocomplete="off" required />
	<input
		name="password"
		type="password"
		placeholder="Password"
		aria-label="New user's password"
		autocomplete="new-password"
		required
	/>
	<button>Add user</button>
</form>
{#if error}<p role="alert">{error}</p>{/if}

<DataTable rows={data.users} columns={[{ key: 'username', label: 'Username' }]}>
	{#snippet cell(user, _key, text)}
		{@const me = user.id === data.user?.id}
		<span class="row">
			{text}
			<button
				disabled={me}
				title={me ? "You can't delete yourself" : undefined}
				onclick={() => confirm(`Delete ${user.username}?`) && send('DELETE', `/api/users/${user.id}`)}
				>Delete</button
			>
		</span>
	{/snippet}
</DataTable>

<style>
	.add {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
</style>
