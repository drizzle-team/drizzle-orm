// Patch Node's fetch to work with wasm drivers
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
	const url = typeof input === 'string'
		? input
		: input instanceof URL
		? input.href
		: (input as Request).url;

	if (typeof url === 'string' && url.startsWith('file://')) {
		const path = fileURLToPath(url);
		const data = await readFile(path);
		const headers = new Headers();
		if (path.endsWith('.wasm')) headers.set('content-type', 'application/wasm');
		return new Response(data, { status: 200, headers });
	}

	return originalFetch(input, init);
}) as typeof fetch;
