<script lang="ts">
	import { goto } from '$app/navigation';

	let error = $state('');

	async function login(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
		e.preventDefault();
		const res = await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))
		});
		if (res.ok) await goto('/', { refreshAll: true });
		else error = res.status === 401 ? 'Wrong username or password' : 'Login failed, try again';
	}
</script>

<form onsubmit={login}>
	<hgroup>
		<p>RFQ CRM</p>
		<h1>Sign in</h1>
	</hgroup>
	<label>
		Username
		<input name="username" autocomplete="username" required />
	</label>
	<label>
		Password
		<input name="password" type="password" autocomplete="current-password" required />
	</label>
	{#if error}<p role="alert">{error}</p>{/if}
	<button>Sign in</button>
</form>

<style>
	form {
		display: grid;
		gap: 1rem;
		width: min(100%, 22rem);
		margin: 12vh auto 0;
		padding: 2rem;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		box-shadow: 0 12px 32px -12px rgb(0 0 0 / 0.2);
	}
	hgroup p {
		margin: 0 0 0.25rem;
		color: var(--accent);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0 0 0.5rem;
	}
	label {
		display: grid;
		gap: 0.375rem;
		font-weight: 500;
	}
	button {
		min-height: 2.5rem;
	}
	[role='alert'] {
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--danger) 10%, transparent);
	}
</style>
