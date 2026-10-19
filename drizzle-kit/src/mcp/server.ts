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

	const generateInput = {
		config: z.string().optional().describe(
			'Custom config file path — relative to the drizzle-kit working directory, or absolute.',
		),
		hints: hintsInput.optional().describe(
			'Resolutions for missing_hints items. Each entry is an object with a "type" discriminator '
				+ '("rename" | "create" | "confirm_data_loss") echoing the unresolved item to resolve.',
		),
		name: z.string().optional().describe('Custom migration name'),
		custom: z.boolean().optional().describe('Generate a blank custom migration'),
	};

	// Builds the handler of the `generate` tool, and of the `fix_conflicts` tool when `fixConflicts` is true.
	// The `fix_conflicts` tool has no `ignoreConflicts` input, so `args.ignoreConflicts` is undefined for it.
	const generateHandler = (fixConflicts?: boolean) => async (args: Record<string, unknown>) => {
		try {
			const envelope = await serialize(() =>
				generate({
					config: args.config as string | undefined,
					hints: args.hints as Hint[] | undefined,
					name: args.name as string | undefined,
					custom: args.custom as boolean | undefined,
					ignoreConflicts: args.ignoreConflicts as boolean | undefined,
					fixConflicts,
				})
			) as unknown as SdkEnvelope;
			return toToolResult(envelope);
		} catch {
			return toToolResult(unexpectedErrorEnvelope());
		}
	};

	server.registerTool(
		'generate',
		{
			description: 'Generate a new migration file by diffing the current schema against the latest snapshot. '
				+ 'If the response has status "missing_hints", re-call with a "hints" array resolving each '
				+ 'unresolved item (rename or create). For postgresql, the error.fix field of a conflicts error lists '
				+ 'the migrations that the fix_conflicts tool deletes. When the error says to run '
				+ '"drizzle-kit generate --fix-conflicts", use the fix_conflicts tool instead.',
			inputSchema: z.object({
				...generateInput,
				ignoreConflicts: z.boolean().optional().describe('Ignore existing snapshot conflicts (not for postgresql)'),
			}),
			outputSchema: looseEnvelopeSchema,
			annotations: { destructiveHint: false },
		},
		generateHandler(),
	);

	server.registerTool(
		'fix_conflicts',
		{
			description: 'For postgresql only. Delete the migrations that check reports as conflicting, with all '
				+ 'their children, then generate one new migration from the schema. '
				+ 'This is a destructive operation. Every database that ran a deleted migration must be reset. '
				+ 'The check_error response for '
				+ 'conflicts lists the folders to delete in error.fix. If the response has status "missing_hints", '
				+ 'nothing is deleted yet: re-call with a "hints" array resolving each unresolved item.',
			inputSchema: z.object(generateInput),
			outputSchema: looseEnvelopeSchema,
			annotations: { destructiveHint: true },
		},
		generateHandler(true),
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
				+ 'Read-only and idempotent — no changes are written to the database or snapshot. '
				+ 'For postgresql, the error.fix field of a conflicts error lists the migrations that the fix_conflicts '
				+ 'tool deletes. When the error says to run "drizzle-kit generate --fix-conflicts", use the fix_conflicts tool instead.',
			inputSchema: z.object({
				config: z.string().optional().describe(
					'Custom config file path — relative to the drizzle-kit working directory, or absolute.',
				),
				ignoreConflicts: z.boolean().optional().describe('Skip conflict checks (not for postgresql)'),
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
			description: 'Upgrade the migrations folder to the current layout and snapshot format. '
				+ 'Moves an old meta/_journal.json folder into one <timestamp>_<name>/ folder per migration with '
				+ 'migration.sql and snapshot.json, and rewrites every older snapshot.json in place. For postgresql it '
				+ 'converts the snapshots to format 9: the first one keeps the full schema and every later one keeps only '
				+ 'the changes of its migration. For postgresql it converts and checks every snapshot before it moves or '
				+ 'writes a file, so a failed up changes no file. '
				+ 'Idempotent: re-running on an already-current folder is a no-op.',
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
				+ 'Reads credentials from the drizzle config file only. When "init" is true, records the pulled '
				+ 'migration as applied in the migrations table of the live database, without running its SQL, '
				+ 'and reports destructiveHint:true via the result _meta key "com.drizzle.team/pull.destructiveHint".',
			inputSchema: z.object({
				config: z.string().optional().describe(
					'Custom config file path — relative to the drizzle-kit working directory, or absolute.',
				),
				init: z.boolean().optional().describe(
					'Record the pulled migration as applied in the migrations table of the LIVE database, '
						+ 'so that migrate does not run it again. The SQL of the migration is not run.',
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
