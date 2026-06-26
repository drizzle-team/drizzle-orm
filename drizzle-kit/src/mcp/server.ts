import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { check, exportSql, generate, pull, push, up } from '../cli-sdk/index.js';
import type { Hint } from '../cli-sdk/index.js';

// Under moduleResolution:"node", the MCP SDK's registerTool generic — which resolves
// both zod/v3 and zod/v4/core as distinct module paths and unifies them against the
// caller's zod schema — causes tsc to exhaust heap (TS2589 / SIGABRT).  Cast the
// server to a non-generic internal interface that matches the runtime API exactly
// but avoids the deep ShapeOutput<ZodObject<...>> instantiation.
interface McpServerCompat {
	registerTool(
		name: string,
		config: {
			title?: string;
			description?: string;
			inputSchema?: z.ZodTypeAny;
			outputSchema?: z.ZodTypeAny;
			annotations?: Record<string, unknown>;
		},
		handler: (args: Record<string, unknown>) => Promise<CallToolResult>,
	): void;
	connect(transport: unknown): Promise<void>;
}

// Advertised as a free-form array so malformed hints reach the SDK and come back as an
// `invalid_hints` envelope, rather than being rejected as an MCP protocol error before the
// handler runs. The hint vocabulary is documented in the per-tool `hints` description.
const hintsInput = z.array(z.record(z.unknown()));

const looseEnvelopeSchema = z.object({
	status: z.enum(['ok', 'no_changes', 'missing_hints', 'error']),
	dialect: z.string().optional(),
	error: z.record(z.unknown()).optional(),
	unresolved: z.array(z.unknown()).optional(),
}).passthrough();

type SdkEnvelope = { status: string } & Record<string, unknown>;

function toToolResult(envelope: SdkEnvelope): CallToolResult {
	const isError = envelope.status === 'error' || envelope.status === 'missing_hints';
	return {
		content: [{ type: 'text', text: JSON.stringify(envelope) }],
		structuredContent: envelope,
		isError,
	};
}

// The SDK functions catch their own errors and resolve with an envelope, so this only fires if a
// rejection unexpectedly escapes — convert it to an envelope rather than let the MCP SDK surface a
// raw error. The detail is omitted deliberately — a raw driver message can carry connection
// credentials, which must never reach any client channel.
const unexpectedErrorEnvelope = (): SdkEnvelope => ({
	status: 'error',
	error: { code: 'internal_error', message: 'unexpected error in MCP tool handler' },
});

export function createDrizzleMcpServer(): McpServer {
	const server = new McpServer({
		name: 'drizzle',
		version: process.env.DRIZZLE_KIT_VERSION ?? '0.0.0',
	}) as unknown as McpServerCompat;

	// Serialize tool calls: concurrent generate/push against the same out dir would
	// interleave snapshot reads/writes (each CLI invocation used to be its own process).
	let chain: Promise<unknown> = Promise.resolve();
	const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
		const next = chain.then(fn, fn);
		chain = next.catch(() => {});
		return next;
	};

	server.registerTool(
		'generate',
		{
			description: 'Generate a new migration file by diffing the current schema against the latest snapshot. '
				+ 'If the response has status "missing_hints", re-call with a "hints" array resolving each '
				+ 'unresolved item (rename or create).',
			inputSchema: z.object({
				config: z.string().optional().describe(
					'Custom config file path — relative to the drizzle-kit working directory, or absolute.',
				),
				hints: hintsInput.optional().describe(
					'Resolutions for missing_hints items. Each entry is an object with a "type" discriminator '
						+ '("rename" | "create" | "confirm_data_loss") echoing the unresolved item to resolve.',
				),
				name: z.string().optional().describe('Custom migration name'),
				custom: z.boolean().optional().describe('Generate a blank custom migration'),
				ignoreConflicts: z.boolean().optional().describe('Ignore existing snapshot conflicts'),
			}),
			outputSchema: looseEnvelopeSchema,
			annotations: { destructiveHint: false },
		},
		async (args) => {
			try {
				const envelope = await serialize(() =>
					generate({
						config: args.config as string | undefined,
						hints: args.hints as Hint[] | undefined,
						name: args.name as string | undefined,
						custom: args.custom as boolean | undefined,
						ignoreConflicts: args.ignoreConflicts as boolean | undefined,
					})
				) as unknown as SdkEnvelope;
				return toToolResult(envelope);
			} catch {
				return toToolResult(unexpectedErrorEnvelope());
			}
		},
	);

	server.registerTool(
		'push',
		{
			description: 'Apply the current schema directly to a live database without writing a migration file. '
				+ 'This is a destructive operation. If the response has status "missing_hints", re-call '
				+ 'with a "hints" array resolving each unresolved item.',
			inputSchema: z.object({
				config: z.string().optional().describe(
					'Custom config file path — relative to the drizzle-kit working directory, or absolute.',
				),
				hints: hintsInput.optional().describe(
					'Resolutions for missing_hints items. Each entry is an object with a "type" discriminator '
						+ '("rename" | "create" | "confirm_data_loss") echoing the unresolved item to resolve.',
				),
			}),
			outputSchema: looseEnvelopeSchema,
			annotations: { destructiveHint: true },
		},
		async (args) => {
			try {
				const envelope = await serialize(() =>
					push({
						config: args.config as string | undefined,
						hints: args.hints as Hint[] | undefined,
					})
				) as unknown as SdkEnvelope;
				return toToolResult(envelope);
			} catch {
				return toToolResult(unexpectedErrorEnvelope());
			}
		},
	);

	server.registerTool(
		'check',
		{
			description: 'Check for migration conflicts in the snapshot history. '
				+ 'Read-only and idempotent — no changes are written to the database or snapshot.',
			inputSchema: z.object({
				config: z.string().optional().describe(
					'Custom config file path — relative to the drizzle-kit working directory, or absolute.',
				),
				ignoreConflicts: z.boolean().optional().describe('Skip conflict checks'),
			}),
			outputSchema: looseEnvelopeSchema,
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async (args) => {
			try {
				const envelope = await serialize(() =>
					check({
						config: args.config as string | undefined,
						ignoreConflicts: args.ignoreConflicts as boolean | undefined,
					})
				) as unknown as SdkEnvelope;
				return toToolResult(envelope);
			} catch {
				return toToolResult(unexpectedErrorEnvelope());
			}
		},
	);

	server.registerTool(
		'export',
		{
			description: 'Export the full schema as a SQL dump by diffing against empty state. '
				+ 'Read-only and idempotent — no DB connection, no files written.',
			inputSchema: z.object({
				config: z.string().optional().describe(
					'Custom config file path — relative to the drizzle-kit working directory, or absolute.',
				),
			}),
			outputSchema: looseEnvelopeSchema,
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async (args) => {
			try {
				const envelope = await serialize(() =>
					exportSql({ config: args.config as string | undefined })
				) as unknown as SdkEnvelope;
				return toToolResult(envelope);
			} catch {
				return toToolResult(unexpectedErrorEnvelope());
			}
		},
	);

	server.registerTool(
		'up',
		{
			description: 'Upgrade on-disk migration snapshots to the latest format. '
				+ 'Rewrites meta/*_snapshot.json files in place; idempotent (re-running on already-latest snapshots is a no-op).',
			inputSchema: z.object({
				config: z.string().optional().describe(
					'Custom config file path — relative to the drizzle-kit working directory, or absolute.',
				),
			}),
			outputSchema: looseEnvelopeSchema,
			annotations: { idempotentHint: true },
		},
		async (args) => {
			try {
				const envelope = await serialize(() =>
					up({ config: args.config as string | undefined })
				) as unknown as SdkEnvelope;
				return toToolResult(envelope);
			} catch {
				return toToolResult(unexpectedErrorEnvelope());
			}
		},
	);

	server.registerTool(
		'pull',
		{
			description: 'Introspect a live database and write schema.ts/relations.ts/snapshot to the out directory. '
				+ 'Reads credentials from the drizzle config file only. When "init" is true, runs the initial '
				+ 'migration against the live database (a destructive operation) and reports destructiveHint:true '
				+ 'via the result _meta key "com.drizzle.team/pull.destructiveHint".',
			inputSchema: z.object({
				config: z.string().optional().describe(
					'Custom config file path — relative to the drizzle-kit working directory, or absolute.',
				),
				init: z.boolean().optional().describe(
					'Create migration metadata for the pulled schema in the database. '
						+ 'This runs the initial migration against the LIVE database — a destructive operation.',
				),
			}),
			outputSchema: looseEnvelopeSchema,
			// Static listTools annotation — cannot flip per call; the init:true escalation rides result._meta.
			annotations: { destructiveHint: false },
		},
		async (args) => {
			try {
				const envelope = await serialize(() =>
					pull({
						config: args.config as string | undefined,
						init: args.init as boolean | undefined,
					})
				) as unknown as SdkEnvelope;
				const result = toToolResult(envelope);
				// Per-call escalation derived from the input only — never the envelope (keeps it CLI≡SDK identical)
				// and independent of isError, so a failed init call still warns the client.
				if (args.init === true) {
					result._meta = { 'com.drizzle.team/pull.destructiveHint': true };
				}
				return result;
			} catch {
				return toToolResult(unexpectedErrorEnvelope());
			}
		},
	);

	return server as unknown as McpServer;
}

export async function startMcpServer(): Promise<void> {
	const server = createDrizzleMcpServer();
	process.stderr.write(`drizzle-kit mcp v${process.env.DRIZZLE_KIT_VERSION ?? '0.0.0'}\n`);
	await server.connect(new StdioServerTransport());
}
