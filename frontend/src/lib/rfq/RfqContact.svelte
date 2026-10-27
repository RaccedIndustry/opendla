<script lang="ts">
	import type { Rfq } from '#lib/api.ts';

	/** Who to ask about the RFQ. */
	let { buyer, office }: { buyer: Rfq['data']['buyer']; office: Rfq['data']['issuing_office'] } =
		$props();
</script>

<section>
	<h3>Buyer</h3>
	<dl>
		{#if buyer?.name}
			<div><dt>Name</dt><dd>{buyer.name}{buyer.code ? ` (${buyer.code})` : ''}</dd></div>
		{/if}
		{#if buyer?.phone}
			<div>
				<dt>Phone</dt>
				<dd><a href="tel:{buyer.phone.replace(/[^\d+]/g, '')}">{buyer.phone}</a></dd>
			</div>
		{/if}
		{#if buyer?.email}
			<div><dt>Email</dt><dd><a href="mailto:{buyer.email}">{buyer.email}</a></dd></div>
		{/if}
		{#if office}<div><dt>Office</dt><dd>{office.lines.join(', ')}</dd></div>{/if}
	</dl>
</section>
