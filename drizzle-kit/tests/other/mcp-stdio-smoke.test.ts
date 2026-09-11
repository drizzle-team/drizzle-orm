import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const binPath = resolve(process.cwd(), 'dist', 'bin.cjs');
const skipDistTests = process.env.DRIZZLE_KIT_SKIP_DIST_TESTS === '1';
const missingDist = !existsSync(binPath);
const skipForMissingDist = !skipDistTests && missingDist;

if (skipForMissingDist && !process.env.CI) {
	// eslint-disable-next-line no-console
	console.warn(
		`[stdio-smoke] skipping: dist/bin.cjs is not built. `
			+ `Run \`pnpm --filter drizzle-kit build\` to enable this smoke test, `
			+ `or set DRIZZLE_KIT_SKIP_DIST_TESTS=1 to silence this warning.`,
	);
}

describe('drizzle-kit mcp stdio smoke', () => {
	beforeAll(() => {
		if (skipForMissingDist && process.env.CI) {
			throw new Error(
				`stdio-smoke requires a built dist/bin.cjs. Run \`pnpm --filter drizzle-kit build\` first.`,
			);
		}
	});

	test.skipIf(skipDistTests || skipForMissingDist)(
		'spawned drizzle-kit mcp connects, lists check/export/generate/pull/push/up tools, and prints version to stderr',
		async () => {
			const stderrChunks: Buffer[] = [];

			const transport = new StdioClientTransport({
				command: 'node',
				args: [binPath, 'mcp'],
				stderr: 'pipe',
			});

			// Capture stderr for version banner assertion
			transport.stderr?.on('data', (chunk: Buffer) => {
				stderrChunks.push(chunk);
			});

			const client = new Client({ name: 'smoke-client', version: '0' });

			// Any stdout corruption would throw a JSON-RPC parse error during connect
			await client.connect(transport);

			const { tools } = await client.listTools();
			expect(tools.map((t) => t.name).sort()).toEqual(['check', 'export', 'generate', 'pull', 'push', 'up']);

			await client.close();

			const stderr = Buffer.concat(stderrChunks).toString('utf8');
			// server prints a version banner to stderr at startup
			expect(stderr).toMatch(/drizzle-kit\s+mcp\s+v\d/i);
		},
		30_000,
	);
});
