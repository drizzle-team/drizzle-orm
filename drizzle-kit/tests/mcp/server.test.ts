import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createDrizzleMcpServer } from '../../src/mcp/server.js';
import { pull } from '../../src/sdk';
import { stageUpNonLatest } from '../sdk/up-fixtures';
import {
	stageConflict,
	stageGenerateMissingHints,
	stageOut,
	stageValid,
	writeDrizzleConfig,
	writeSentinelPullConfig,
	writeSentinelPushConfig,
} from './fixtures';

// The vitest config sets TEST_CONFIG_PATH_PREFIX=./tests/cli/ globally.
// The absolute schema paths in MCP fixtures are broken by that prefix, so unset it here.
let originalPrefix: string | undefined;

beforeEach(() => {
	originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
	delete process.env.TEST_CONFIG_PATH_PREFIX;
});

afterEach(() => {
	vi.restoreAllMocks();
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

	test('push tool advertises destructiveHint: true', async () => {
		const { client } = await connectPair();
		const { tools } = await client.listTools();
		const push = tools.find((t) => t.name === 'push');
		expect(push).toBeDefined();
		expect(push?.annotations?.destructiveHint).toBe(true);
		await client.close();
	});

	test('check tool advertises readOnlyHint: true and idempotentHint: true', async () => {
		const { client } = await connectPair();
		const { tools } = await client.listTools();
		const check = tools.find((t) => t.name === 'check');
		expect(check).toBeDefined();
		expect(check?.annotations?.readOnlyHint).toBe(true);
		expect(check?.annotations?.idempotentHint).toBe(true);
		await client.close();
	});

	test('export tool advertises readOnlyHint: true and idempotentHint: true', async () => {
		const { client } = await connectPair();
		const { tools } = await client.listTools();
		const exportTool = tools.find((t) => t.name === 'export');
		expect(exportTool).toBeDefined();
		expect(exportTool?.annotations?.readOnlyHint).toBe(true);
		expect(exportTool?.annotations?.idempotentHint).toBe(true);
		await client.close();
	});

	test('up tool advertises idempotentHint: true and not readOnlyHint', async () => {
		const { client } = await connectPair();
		const { tools } = await client.listTools();
		const up = tools.find((t) => t.name === 'up');
		expect(up).toBeDefined();
		expect(up?.annotations?.idempotentHint).toBe(true);
		expect(up?.annotations?.readOnlyHint).toBeFalsy();
		await client.close();
	});

	test('pull tool advertises a static destructiveHint: false', async () => {
		const { client } = await connectPair();
		const { tools } = await client.listTools();
		const pull = tools.find((t) => t.name === 'pull');
		expect(pull).toBeDefined();
		expect(pull?.annotations?.destructiveHint).toBe(false);
		await client.close();
	});

	test('generate tool does not advertise destructiveHint: true', async () => {
		const { client } = await connectPair();
		const { tools } = await client.listTools();
		const generate = tools.find((t) => t.name === 'generate');
		expect(generate).toBeDefined();
		expect(generate?.annotations?.destructiveHint).not.toBe(true);
		await client.close();
	});

	test('no tool inputSchema contains credential or forbidden keys', async () => {
		const { client } = await connectPair();
		const { tools } = await client.listTools();
		const forbidden = ['url', 'host', 'port', 'user', 'password', 'authToken', 'credentials', 'force'];
		for (const tool of tools) {
			const schemaKeys = Object.keys((tool.inputSchema as any)?.properties ?? {});
			// Guard against a zod→JSON-schema regression yielding empty `properties`, which would
			// make every `not.toContain` below pass vacuously.
			if (tool.name === 'generate') expect(schemaKeys).toEqual(expect.arrayContaining(['config', 'hints', 'name']));
			if (tool.name === 'push') expect(schemaKeys).toEqual(expect.arrayContaining(['config', 'hints']));
			if (tool.name === 'check') expect(schemaKeys).toEqual(expect.arrayContaining(['config', 'ignoreConflicts']));
			if (tool.name === 'export') expect(schemaKeys).toEqual(expect.arrayContaining(['config']));
			if (tool.name === 'up') expect(schemaKeys).toEqual(expect.arrayContaining(['config']));
			if (tool.name === 'pull') expect(schemaKeys).toEqual(expect.arrayContaining(['config', 'init']));
			for (const key of forbidden) {
				expect(
					schemaKeys,
					`${tool.name} inputSchema must not contain '${key}'`,
				).not.toContain(key);
			}
		}
		await client.close();
	});
});

describe('MCP server pull tool — per-call destructive _meta escalation', () => {
	test('init:true sets the destructive _meta signal; omitting init does not (signal derives from input)', async () => {
		const { client } = await connectPair();
		const out = stageOut();
		// The signal derives from the input, so the unreachable sentinel config (no live DB) is enough.
		const { configPath } = writeSentinelPullConfig(out);
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

	test('check against stageConflict returns isError:true and status:error (MCP-05: resolves, does not reject)', async () => {
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

describe('MCP server credential-leak regression (D-13)', () => {
	test('push with unreachable sentinel URL returns an error; sentinel absent from all result channels', async () => {
		// Capture stderr so we can assert the sentinel never appears there either
		const stderrChunks: string[] = [];
		const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(
			((...args: unknown[]) => {
				stderrChunks.push(String(args[0]));
				return true;
			}) as unknown as typeof process.stderr.write,
		);

		const out = stageOut();
		const { configPath, sentinel } = writeSentinelPushConfig(out);
		try {
			const { client } = await connectPair();
			const result = await client.callTool({ name: 'push', arguments: { config: configPath } });
			stderrSpy.mockRestore();

			// Must surface as isError:true with an error status
			expect(result.isError).toBe(true);
			const sc = result.structuredContent as any;
			expect(sc.status).toBe('error');

			// Sentinel must not appear in any result channel
			const textBlock = (result.content as any[]).find((c) => c.type === 'text');
			expect(textBlock?.text ?? '').not.toContain(sentinel);
			expect(JSON.stringify(sc)).not.toContain(sentinel);
			// Captured stderr must not contain the sentinel
			expect(stderrChunks.join('')).not.toContain(sentinel);

			await client.close();
		} finally {
			stderrSpy.mockRestore();
			rmSync(out, { recursive: true, force: true });
		}
	});
});

describe('MCP server pull credential-leak regression', () => {
	// Both spans funnel through the redacted DatabaseDriverCliError against the unreachable 127.0.0.1:1 URL:
	// the bare {config} call fails at connect/introspect, the {config,init:true} call exercises the --init
	// migrate-span redaction descriptor. Neither must leak the sentinel into any channel on either transport.
	for (const init of [false, true] as const) {
		const label = init ? '{ config, init: true } (--init migrate span)' : '{ config } (connect/introspect span)';
		test(`pull ${label}: sentinel absent from SDK envelope, MCP text/structuredContent, and stderr`, async () => {
			const stderrChunks: string[] = [];
			const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(
				((...args: unknown[]) => {
					stderrChunks.push(String(args[0]));
					return true;
				}) as unknown as typeof process.stderr.write,
			);

			const out = stageOut();
			const { configPath, sentinel } = writeSentinelPullConfig(out);
			try {
				// SDK path
				const env = await pull(init ? { config: configPath, init: true } : { config: configPath });
				expect(env.status).toBe('error');
				expect(JSON.stringify(env)).not.toContain(sentinel);

				// MCP path
				const { client } = await connectPair();
				const result = await client.callTool({
					name: 'pull',
					arguments: init ? { config: configPath, init: true } : { config: configPath },
				});
				stderrSpy.mockRestore();

				expect(result.isError).toBe(true);
				const sc = result.structuredContent as any;
				expect(sc.status).toBe('error');

				const textBlock = (result.content as any[]).find((c) => c.type === 'text');
				expect(textBlock?.text ?? '').not.toContain(sentinel);
				expect(JSON.stringify(sc)).not.toContain(sentinel);
				expect(stderrChunks.join('')).not.toContain(sentinel);

				// The destructive signal rides the result _meta even on an errored init call.
				if (init) {
					expect(result._meta?.['com.drizzle.team/pull.destructiveHint']).toBe(true);
				}

				await client.close();
			} finally {
				stderrSpy.mockRestore();
				rmSync(out, { recursive: true, force: true });
			}
		});
	}
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
