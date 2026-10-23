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
	<h1>Sign in</h1>
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
		max-width: 20rem;
		margin: 15vh auto;
		padding: 0 1rem;
	}
	label {
		display: grid;
		gap: 0.25rem;
	}
	[role='alert'] {
		margin: 0;
		color: #b00020;
	}
</style>
