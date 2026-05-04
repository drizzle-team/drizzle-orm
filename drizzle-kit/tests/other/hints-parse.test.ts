import { InvalidHintsCliError } from 'src/cli/errors';
import { type ConfirmDataLossHint, type CreateHint, HintsHandler, type RenameHint } from 'src/cli/hints';
import { expect, test } from 'vitest';

const validRenameHints = [
	{ type: 'rename', kind: 'table', from: ['public', 'orders'] as const, to: ['public', 'orders_v2'] as const },
	{
		type: 'rename',
		kind: 'column',
		from: ['public', 'orders', 'status'] as const,
		to: ['public', 'orders', 'state'] as const,
	},
	{ type: 'rename', kind: 'schema', from: ['public'] as const, to: ['archive'] as const },
	{ type: 'rename', kind: 'enum', from: ['public', 'status'] as const, to: ['public', 'order_status'] as const },
	{
		type: 'rename',
		kind: 'sequence',
		from: ['public', 'orders_id_seq'] as const,
		to: ['public', 'orders_v2_id_seq'] as const,
	},
	{ type: 'rename', kind: 'view', from: ['public', 'active_orders'] as const, to: ['public', 'open_orders'] as const },
	{
		type: 'rename',
		kind: 'policy',
		from: ['public', 'orders', 'orders_policy'] as const,
		to: ['public', 'orders', 'orders_rls'] as const,
	},
	{ type: 'rename', kind: 'role', from: ['app_user'] as const, to: ['app_runtime'] as const },
	{
		type: 'rename',
		kind: 'privilege',
		from: ['alice', 'bob', 'public', 'orders', 'SELECT'] as const,
		to: ['alice', 'bob', 'public', 'orders_v2', 'SELECT'] as const,
	},
	{
		type: 'rename',
		kind: 'check',
		from: ['public', 'orders', 'orders_check'] as const,
		to: ['public', 'orders', 'orders_v2_check'] as const,
	},
	{
		type: 'rename',
		kind: 'index',
		from: ['public', 'orders', 'orders_idx'] as const,
		to: ['public', 'orders', 'orders_v2_idx'] as const,
	},
	{
		type: 'rename',
		kind: 'unique',
		from: ['public', 'orders', 'orders_unique'] as const,
		to: ['public', 'orders', 'orders_v2_unique'] as const,
	},
	{
		type: 'rename',
		kind: 'primary key',
		from: ['public', 'orders', 'orders_pkey'] as const,
		to: ['public', 'orders', 'orders_v2_pkey'] as const,
	},
	{
		type: 'rename',
		kind: 'foreign key',
		from: ['public', 'orders', 'orders_user_id_fkey'] as const,
		to: ['public', 'orders', 'orders_v2_user_id_fkey'] as const,
	},
] satisfies readonly RenameHint[];

const validCreateHints = [
	{ type: 'create', kind: 'table', entity: ['public', 'orders'] as const },
	{ type: 'create', kind: 'column', entity: ['public', 'orders', 'status'] as const },
	{ type: 'create', kind: 'schema', entity: ['public'] as const },
	{ type: 'create', kind: 'enum', entity: ['public', 'status'] as const },
	{ type: 'create', kind: 'sequence', entity: ['public', 'orders_id_seq'] as const },
	{ type: 'create', kind: 'view', entity: ['public', 'active_orders'] as const },
	{ type: 'create', kind: 'policy', entity: ['public', 'orders', 'orders_policy'] as const },
	{ type: 'create', kind: 'role', entity: ['app_user'] as const },
	{ type: 'create', kind: 'privilege', entity: ['alice', 'bob', 'public', 'orders', 'SELECT'] as const },
	{ type: 'create', kind: 'check', entity: ['public', 'orders', 'orders_check'] as const },
	{ type: 'create', kind: 'index', entity: ['public', 'orders', 'orders_idx'] as const },
	{ type: 'create', kind: 'unique', entity: ['public', 'orders', 'orders_unique'] as const },
	{ type: 'create', kind: 'primary key', entity: ['public', 'orders', 'orders_pkey'] as const },
	{ type: 'create', kind: 'foreign key', entity: ['public', 'orders', 'orders_user_id_fkey'] as const },
] satisfies readonly CreateHint[];

const validConfirmHints = [
	{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'orders'] as const },
	{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'orders', 'status'] as const },
	{ type: 'confirm_data_loss', kind: 'schema', entity: ['public'] as const },
	{ type: 'confirm_data_loss', kind: 'view', entity: ['public', 'active_orders'] as const },
	{ type: 'confirm_data_loss', kind: 'primary_key', entity: ['public', 'orders', 'orders_pkey'] as const },
	{ type: 'confirm_data_loss', kind: 'not_null_constraint', entity: ['public', 'orders', 'status'] as const },
	{ type: 'confirm_data_loss', kind: 'unique_constraint', entity: ['public', 'orders', 'email'] as const },
] satisfies readonly ConfirmDataLossHint[];

async function expectInvalidHints(raw: unknown): Promise<InvalidHintsCliError> {
	try {
		await HintsHandler.fromCli({ hints: JSON.stringify(raw) });
	} catch (error) {
		if (error instanceof InvalidHintsCliError) {
			return error;
		}

		throw error;
	}

	throw new Error('Expected HintsHandler.fromCli to throw InvalidHintsCliError');
}

function firstIssue(error: InvalidHintsCliError): Record<string, unknown> {
	const issues = (error.meta?.issues ?? []) as Record<string, unknown>[];
	const [issue] = issues;
	if (!issue) {
		throw new Error('Expected invalid_hints error to include at least one issue');
	}
	return issue;
}

test('HintsHandler.fromCli accepts valid hints for every supported type and kind', async () => {
	const raw = [...validRenameHints, ...validCreateHints, ...validConfirmHints];
	const handler = await HintsHandler.fromCli({ hints: JSON.stringify(raw) });

	for (const hint of validRenameHints) {
		expect(handler.matchRename(hint.kind, hint.to as never)).toStrictEqual(hint);
	}

	for (const hint of validCreateHints) {
		expect(handler.matchCreate(hint.kind, hint.entity as never)).toStrictEqual(hint);
	}

	for (const hint of validConfirmHints) {
		expect(handler.matchConfirm(hint.kind, hint.entity as never)).toStrictEqual(hint);
	}
});

test('HintsHandler.fromCli rejects invalid type', async () => {
	const error = await expectInvalidHints([{ type: 'drop', kind: 'table', entity: ['public', 'orders'] }]);
	const issue = firstIssue(error);

	expect(error.code).toBe('invalid_hints');
	expect(error.meta?.source).toBe('inline');
	expect(issue).toMatchObject({
		code: 'invalid_union',
		path: [0],
	});
	expect(issue.message).toContain('Invalid input');
});

test('HintsHandler.fromCli rejects invalid confirm_data_loss kind', async () => {
	const error = await expectInvalidHints([{ type: 'confirm_data_loss', kind: 'enum', entity: ['public', 'status'] }]);
	const issue = firstIssue(error);

	expect(error.code).toBe('invalid_hints');
	expect(issue).toMatchObject({
		code: 'invalid_union',
		path: [0],
	});
	expect(issue.message).toContain('Invalid input');
});

test('HintsHandler.fromCli rejects unsupported rename/create hint kinds', async () => {
	const error = await expectInvalidHints([{ type: 'create', kind: 'trigger', entity: ['public', 'orders', 'id'] }]);
	const issue = firstIssue(error);

	expect(error.code).toBe('invalid_hints');
	expect(issue.path).toContain(0);
	expect(JSON.stringify(issue)).toContain('trigger');
});

test('HintsHandler.fromCli rejects tuple arity mismatches at the hint item path', async () => {
	const error = await expectInvalidHints([{ type: 'create', kind: 'column', entity: ['public', 'orders'] }]);
	const issue = firstIssue(error);

	expect(error.code).toBe('invalid_hints');
	expect(issue).toMatchObject({
		code: 'invalid_union',
		path: [0],
	});
});

test('HintsHandler.fromCli rejects non-string tuple members', async () => {
	const error = await expectInvalidHints([
		{ type: 'rename', kind: 'table', from: ['public', 'orders'], to: ['public', 42] },
	]);
	const issue = firstIssue(error);

	expect(error.code).toBe('invalid_hints');
	expect(issue).toMatchObject({
		code: 'invalid_union',
		path: [0],
	});
});

test('HintsHandler.fromCli rejects unknown top-level fields', async () => {
	const error = await expectInvalidHints([
		{ type: 'create', kind: 'table', entity: ['public', 'orders'], unexpected: true },
	]);
	const issue = firstIssue(error);

	expect(error.code).toBe('invalid_hints');
	expect(issue).toMatchObject({
		code: 'unrecognized_keys',
		keys: ['unexpected'],
		path: [0],
	});
});

test('HintsHandler.fromCli accepts an empty hints array', async () => {
	const handler = await HintsHandler.fromCli({ hints: '[]' });

	expect(handler.missingHints).toStrictEqual([]);
});

test('HintsHandler.fromCli rejects non-array input', async () => {
	const error = await expectInvalidHints({ type: 'create', kind: 'table', entity: ['public', 'orders'] });
	const issue = firstIssue(error);

	expect(error.code).toBe('invalid_hints');
	expect(issue).toMatchObject({
		code: 'invalid_type',
		expected: 'array',
		received: 'object',
		path: [],
	});
});

test('HintsHandler.matchRename returns the stored rename hint', () => {
	const [renameHint] = validRenameHints;
	const handler = new HintsHandler([renameHint]);

	expect(handler.matchRename('table', ['public', 'orders_v2'])).toStrictEqual(renameHint);
});

test('HintsHandler.matchCreate returns the stored create hint', () => {
	const createHint = validCreateHints[1]!;
	const handler = new HintsHandler([createHint]);

	expect(handler.matchCreate('column', ['public', 'orders', 'status'])).toStrictEqual(createHint);
});

test('HintsHandler.matchConfirm returns the stored confirm hint', () => {
	const [confirmHint] = validConfirmHints;
	const handler = new HintsHandler([confirmHint]);

	expect(handler.matchConfirm('table', ['public', 'orders'])).toStrictEqual(confirmHint);
});

test('HintsHandler keeps tuple identities collision-free when matching hints', () => {
	const explicitSchemaHint = {
		type: 'create',
		kind: 'table',
		entity: ['public', 'orders'] as const,
	} satisfies CreateHint;
	const joinedStringHint = {
		type: 'create',
		kind: 'table',
		entity: ['', 'public_orders'] as const,
	} satisfies CreateHint;
	const handler = new HintsHandler([explicitSchemaHint, joinedStringHint]);

	expect(handler.matchCreate('table', ['public', 'orders'])).toStrictEqual(explicitSchemaHint);
	expect(handler.matchCreate('table', ['', 'public_orders'])).toStrictEqual(joinedStringHint);
});

test('HintsHandler preserves missing hint insertion order', () => {
	const hints = new HintsHandler();

	hints.pushMissingHint({ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders'] });
	hints.pushMissingHint({
		type: 'confirm_data_loss',
		kind: 'table',
		entity: ['public', 'customers'],
		reason: 'non_empty',
	});
	hints.pushMissingHint({ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'email'] });

	expect(hints.missingHints).toStrictEqual([
		{ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders'] },
		{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'customers'], reason: 'non_empty' },
		{ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'email'] },
	]);
});
