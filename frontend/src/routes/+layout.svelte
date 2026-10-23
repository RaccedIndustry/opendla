<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		await goto('/login', { refreshAll: true });
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<header>
		{data.user.username}
		<button onclick={logout}>Log out</button>
	</header>
{/if}

{@render children()}

<style>
	header {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid #ddd;
	}
</style>
