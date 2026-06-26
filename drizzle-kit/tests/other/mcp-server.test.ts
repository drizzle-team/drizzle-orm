import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { createDrizzleMcpServer } from '../../src/mcp/server.js';
import {
	stageConflict,
	stageGenerateMissingHints,
	stageOut,
	stageValid,
	writeDrizzleConfig,
	writeUnreachablePullConfig,
} from './mcp-fixtures';
import { stageUpNonLatest } from './up-fixtures';

// The `pnpm test` script sets TEST_CONFIG_PATH_PREFIX=./tests/cli/ for the whole run.
// Absolute schema paths in the MCP fixtures are broken by that prefix, so unset it for this file.
const originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
delete process.env.TEST_CONFIG_PATH_PREFIX;

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(() => {
	if (originalPrefix !== undefined) {
		process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
	}
});

/** Connect a fresh createDrizzleMcpServer() and Client over InMemoryTransport. Returns client and a teardown fn. */
const connectPair = async () => {
	const server = createDrizzleMcpServer();
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: 'test-client', version: '0' });
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return { client, server };
};

describe('MCP server tool registration', () => {
	test('listTools returns exactly check, export, generate, pull, push, up', async () => {
		const { client } = await connectPair();
		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name).sort()).toEqual(['check', 'export', 'generate', 'pull', 'push', 'up']);
		await client.close();
	});
});

describe('MCP server pull tool — per-call destructive _meta escalation', () => {
	test('init:true sets the destructive _meta signal; omitting init does not (signal derives from input)', async () => {
		const { client } = await connectPair();
		const out = stageOut();
		// The signal derives from the input, so the unreachable config (no live DB) is enough.
		const { configPath } = writeUnreachablePullConfig(out);
		try {
			const r1 = await client.callTool({ name: 'pull', arguments: { config: configPath } });
			expect((r1._meta ?? {})['com.drizzle.team/pull.destructiveHint']).toBeFalsy();

			const r2 = await client.callTool({ name: 'pull', arguments: { config: configPath, init: true } });
			expect(r2._meta?.['com.drizzle.team/pull.destructiveHint']).toBe(true);
		} finally {
			await client.close();
			rmSync(out, { recursive: true, force: true });
		}
	});
});

describe('MCP server check tool', () => {
	test('check against stageValid returns isError:false and status:ok in both channels', async () => {
		const { client } = await connectPair();
		const out = stageValid();
		const config = writeDrizzleConfig(out);
		try {
			const result = await client.callTool({ name: 'check', arguments: { config } });
			expect(result.isError).toBe(false);
			expect(result.structuredContent).toMatchObject({ status: 'ok' });
			const textBlock = (result.content as any[]).find((c) => c.type === 'text');
			expect(textBlock).toBeDefined();
			const parsed = JSON.parse(textBlock.text);
			expect(parsed).toMatchObject({ status: 'ok' });
		} finally {
			await client.close();
			rmSync(out, { recursive: true, force: true });
		}
	});

	test('check against stageConflict resolves to isError:true and status:error rather than rejecting', async () => {
		const { client } = await connectPair();
		const out = stageConflict();
		const config = writeDrizzleConfig(out);
		try {
			const result = await client.callTool({ name: 'check', arguments: { config } });
			expect(result.isError).toBe(true);
			expect(result.structuredContent).toMatchObject({ status: 'error' });
		} finally {
			await client.close();
			rmSync(out, { recursive: true, force: true });
		}
	});
});

describe('MCP server export tool', () => {
	test('export against a valid schema returns isError:false and status:ok in both channels', async () => {
		const { client } = await connectPair();
		const out = stageOut();
		const schemaPath = resolve(join(out, 'schema.ts'));
		writeFileSync(
			schemaPath,
			"import { integer, pgTable } from 'drizzle-orm/pg-core';\nexport const t = pgTable('t', { id: integer('id') });\n",
		);
		const config = writeDrizzleConfig(out, schemaPath);
		try {
			const result = await client.callTool({ name: 'export', arguments: { config } });
			expect(result.isError).toBe(false);
			expect(result.structuredContent).toMatchObject({ status: 'ok' });
			const textBlock = (result.content as any[]).find((c) => c.type === 'text');
			expect(textBlock).toBeDefined();
			const parsed = JSON.parse(textBlock.text);
			expect(parsed).toMatchObject({ status: 'ok' });
		} finally {
			await client.close();
			rmSync(out, { recursive: true, force: true });
		}
	});
});

describe('MCP server up tool', () => {
	test('up against a non-latest snapshot returns isError:false and status:ok with non-empty upgraded[]', async () => {
		const { client } = await connectPair();
		const out = stageUpNonLatest();
		// up reads snapshots, not the schema — the default schema line is never consulted.
		const config = writeDrizzleConfig(out);
		try {
			const result = await client.callTool({ name: 'up', arguments: { config } });
			expect(result.isError).toBe(false);
			expect(result.structuredContent).toMatchObject({ status: 'ok' });
			const textBlock = (result.content as any[]).find((c) => c.type === 'text');
			expect(textBlock).toBeDefined();
			const parsed = JSON.parse(textBlock.text);
			expect(parsed).toMatchObject({ status: 'ok' });
			const sc = result.structuredContent as any;
			expect(Array.isArray(sc.upgraded)).toBe(true);
			expect(sc.upgraded.length).toBeGreaterThan(0);
		} finally {
			await client.close();
			rmSync(out, { recursive: true, force: true });
		}
	});
});

describe('MCP server generate tool — missing_hints round-trip', () => {
	test('generate without hints returns isError:true with status:missing_hints and non-empty unresolved[]', async () => {
		const { client } = await connectPair();
		const { out, schemaPath } = stageGenerateMissingHints();
		const config = writeDrizzleConfig(out, schemaPath);
		try {
			const result = await client.callTool({ name: 'generate', arguments: { config } });
			expect(result.isError).toBe(true);
			expect(result.structuredContent).toMatchObject({ status: 'missing_hints' });
			const sc = result.structuredContent as any;
			expect(Array.isArray(sc.unresolved)).toBe(true);
			expect(sc.unresolved.length).toBeGreaterThan(0);
		} finally {
			await client.close();
			rmSync(out, { recursive: true, force: true });
		}
	});

	test('generate with resolving hints returns isError:false', async () => {
		const { client } = await connectPair();
		const { out, schemaPath } = stageGenerateMissingHints();
		const config = writeDrizzleConfig(out, schemaPath);
		try {
			// First call: get unresolved items
			const first = await client.callTool({ name: 'generate', arguments: { config } });
			expect(first.isError).toBe(true);
			const sc = first.structuredContent as any;
			expect(sc.status).toBe('missing_hints');

			// Resolve each rename_or_create as 'create' so no rename hint is needed
			const hints = sc.unresolved
				.filter((u: any) => u.type === 'rename_or_create')
				.map((u: any) => ({ type: 'create' as const, kind: u.kind, entity: u.entity }));

			const second = await client.callTool({ name: 'generate', arguments: { config, hints } });
			expect(second.isError).toBe(false);
		} finally {
			await client.close();
			rmSync(out, { recursive: true, force: true });
		}
	});

	test('generate with a malformed hint returns an invalid_hints envelope, not a protocol error', async () => {
		const { client } = await connectPair();
		const { out, schemaPath } = stageGenerateMissingHints();
		const config = writeDrizzleConfig(out, schemaPath);
		try {
			// A hint with an unknown `type` fails hintSchema parsing. The loose tool input schema
			// lets it through to the SDK, which must surface it as an `invalid_hints` envelope
			// (isError:true) rather than the MCP layer rejecting the call as InvalidParams.
			const result = await client.callTool({
				name: 'generate',
				arguments: { config, hints: [{ type: 'not_a_real_hint' }] },
			});
			expect(result.isError).toBe(true);
			expect(result.structuredContent).toMatchObject({ status: 'error', error: { code: 'invalid_hints' } });
		} finally {
			await client.close();
			rmSync(out, { recursive: true, force: true });
		}
	});
});

describe('MCP server stdout purity (in-process)', () => {
	test('tool call does not write to process.stdout', async () => {
		const stdoutCalls: unknown[][] = [];
		const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(
			((...args: unknown[]) => {
				stdoutCalls.push(args);
				return true;
			}) as unknown as typeof process.stdout.write,
		);

		const { client } = await connectPair();
		const out = stageValid();
		const config = writeDrizzleConfig(out);
		try {
			await client.callTool({ name: 'check', arguments: { config } });
		} finally {
			await client.close();
			rmSync(out, { recursive: true, force: true });
		}

		// Assert captured array AFTER mockRestore (spy.calls is cleared by restore)
		stdoutSpy.mockRestore();
		expect(stdoutCalls.map((c) => String(c[0]).slice(0, 200))).toEqual([]);
	});
});
