<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const tabs = [
		['/users', 'Users'],
		['/archives', 'Archives'],
		['/rfqs', 'RFQs']
	];

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
		<a class="brand" href="/">RFQ CRM</a>
		<nav>
			{#each tabs as [href, label] (href)}
				<a {href} aria-current={page.url.pathname.startsWith(href) ? 'page' : undefined}>{label}</a>
			{/each}
		</nav>
		<span class="user">{data.user.username}</span>
		<button onclick={logout}>Log out</button>
	</header>
{/if}

<main>
	{@render children()}
</main>

<style>
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}
	.brand {
		margin-right: 1rem;
		color: inherit;
		font-weight: 700;
	}
	.user {
		margin-left: auto;
		color: var(--muted);
	}
	main {
		padding: 1.5rem;
	}
</style>
