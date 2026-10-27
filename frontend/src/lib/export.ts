/** A value as a table cell reads: blank for null, Yes/No for booleans, JSON for lists and objects. */
export function text(v: unknown) {
	if (v == null) return '';
	if (typeof v === 'boolean') return v ? 'Yes' : 'No';
	return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/**
 * RFC 4180 CSV, with a BOM so Excel reads it as UTF-8 (the last award has × and ·).
 * Text starting with = + - @ gets a leading ' so Excel shows it instead of running it as a formula.
 */
export function csv(rows: unknown[][]) {
	const field = (v: unknown) => {
		const s = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : text(v);
		return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
	};
	return '﻿' + rows.map((r) => r.map(field).join(',')).join('\r\n');
}

/** An .xlsx with the header row bold and frozen. Numbers stay numbers; the rest is the text the table shows. */
export async function xlsx([head, ...body]: unknown[][]) {
	// Loaded on the first export, so it isn't in the pages' bundle.
	// ponytail: builds on the main thread; switch to the /browser build (Web Worker) if big exports stall the page
	const { default: writeExcelFile } = await import('write-excel-file/universal');
	return writeExcelFile(
		[
			head.map((v) => ({ value: text(v), fontWeight: 'bold' as const })),
			...body.map((r) => r.map((v) => (typeof v === 'number' ? v : text(v) || null)))
		],
		{
			stickyRowsCount: 1,
			// As wide as the longest value, up to 60 characters.
			columns: head.map((v, i) => ({
				width: Math.min(60, body.reduce((w, r) => Math.max(w, text(r[i]).length), text(v).length) + 2)
			}))
		}
	).toBlob();
}

/** Hands a file to the browser as a download. */
export function download(blob: Blob, name: string) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = name;
	a.click();
	// Revoking at once can cancel the download in some browsers.
	setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
