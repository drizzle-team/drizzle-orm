import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { hintSchema } from '../cli/hints.js';
import { check, generate, push } from '../sdk/index.js';

const looseEnvelopeSchema = z.object({
	status: z.enum(['ok', 'no_changes', 'missing_hints', 'error']),
	dialect: z.string().optional(),
	error: z.record(z.unknown()).optional(),
	unresolved: z.array(z.unknown()).optional(),
}).passthrough();

function toToolResult(envelope: Awaited<ReturnType<typeof check>>): CallToolResult {
	const isError = envelope.status === 'error' || envelope.status === 'missing_hints';
	return {
		content: [{ type: 'text', text: JSON.stringify(envelope) }],
		structuredContent: envelope as Record<string, unknown>,
		isError,
	};
}

export function createDrizzleMcpServer(): McpServer {
	const server = new McpServer({
		name: 'drizzle',
		version: process.env.DRIZZLE_KIT_VERSION ?? '0.0.0',
	});

	server.registerTool(
		'generate',
		{
			description: 'Generate a new migration file by diffing the current schema against the latest snapshot. '
				+ 'If the response has status "missing_hints", re-call with a "hints" array resolving each '
				+ 'unresolved item (rename or create). There is no "force" parameter — all ambiguous changes '
				+ 'must be resolved via hints.',
			inputSchema: z.object({
				config: z.string().optional().describe('Path to drizzle.config.* (defaults to project root)'),
				hints: hintSchema.optional().describe('Hint array resolving rename/create/confirm_data_loss items'),
				name: z.string().optional().describe('Custom migration name'),
				custom: z.boolean().optional().describe('Generate a blank custom migration'),
				ignoreConflicts: z.boolean().optional().describe('Ignore existing snapshot conflicts'),
			}),
			outputSchema: looseEnvelopeSchema,
			annotations: { destructiveHint: false },
		},
		async (args): Promise<CallToolResult> => {
			const envelope = await generate({
				config: args.config,
				hints: args.hints,
				name: args.name,
				custom: args.custom,
				ignoreConflicts: args.ignoreConflicts,
			});
			return toToolResult(envelope);
		},
	);

	server.registerTool(
		'push',
		{
			description: 'Apply the current schema directly to a live database without writing a migration file. '
				+ 'This is a destructive operation. If the response has status "missing_hints", re-call '
				+ 'with a "hints" array resolving each unresolved item. There is no "force" parameter.',
			inputSchema: z.object({
				config: z.string().optional().describe('Path to drizzle.config.* (defaults to project root)'),
				hints: hintSchema.optional().describe('Hint array resolving rename/create/confirm_data_loss items'),
			}),
			outputSchema: looseEnvelopeSchema,
			annotations: { destructiveHint: true },
		},
		async (args): Promise<CallToolResult> => {
			const envelope = await push({
				config: args.config,
				hints: args.hints,
			});
			return toToolResult(envelope);
		},
	);

	server.registerTool(
		'check',
		{
			description: 'Check for migration conflicts in the snapshot history. '
				+ 'Read-only and idempotent — no changes are written to the database or snapshot.',
			inputSchema: z.object({
				config: z.string().optional().describe('Path to drizzle.config.* (defaults to project root)'),
				ignoreConflicts: z.boolean().optional().describe('Treat conflicts as warnings rather than errors'),
			}),
			outputSchema: looseEnvelopeSchema,
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async (args): Promise<CallToolResult> => {
			const envelope = await check({
				config: args.config,
				ignoreConflicts: args.ignoreConflicts,
			});
			return toToolResult(envelope);
		},
	);

	return server;
}

export async function startMcpServer(): Promise<void> {
	const server = createDrizzleMcpServer();
	process.stderr.write(`drizzle-kit mcp v${process.env.DRIZZLE_KIT_VERSION ?? ''}\n`);
	await server.connect(new StdioServerTransport());
}
