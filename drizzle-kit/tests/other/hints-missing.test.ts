import { runWithCliContext } from 'src/cli/context';
import { HintsHandler } from 'src/cli/hints';
import { resolver } from 'src/cli/prompts';
import { afterEach, expect, test, vi } from 'vitest';

type Entity = {
	name: string;
	schema?: string;
	table?: string;
	grantor?: string;
	grantee?: string;
	type?: string;
};

const table = (name: string, schema?: string): Entity => ({ name, schema });
const column = (tableName: string, name: string, schema?: string): Entity => ({
	name,
	table: tableName,
	schema,
});

afterEach(() => {
	vi.restoreAllMocks();
});

test('new HintsHandler reports no missing hints', () => {
	const hints = new HintsHandler();
	expect(hints.hasMissingHints()).toBe(false);
});

test('resolver aggregates unresolved items across repeated calls on the same HintsHandler', async () => {
	const { hints, tableResult, columnResult } = await runWithCliContext({ output: 'json', interactive: false }, async () => {
		const hints = new HintsHandler();
		const resolveTables = resolver<Entity>('table', 'public', hints);
		const resolveColumns = resolver<Entity>('column', 'public', hints);

		const tableResult = await resolveTables({
			created: [table('members', 'public')],
			deleted: [table('users', 'public')],
		});
		const columnResult = await resolveColumns({
			created: [column('users', 'email', 'public')],
			deleted: [column('users', 'name', 'public')],
		});

		return { hints, tableResult, columnResult };
	});

	expect(tableResult.unresolved).toStrictEqual([
		{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] },
	]);
	expect(columnResult.unresolved).toStrictEqual([
		{ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'email'] },
	]);
	expect(hints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] },
			{ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'email'] },
		],
	});
});

test('each HintsHandler instance owns its own missing hints state', async () => {
	const { firstHints, secondHints } = await runWithCliContext({ output: 'json', interactive: false }, async () => {
		const firstHints = new HintsHandler();
		const secondHints = new HintsHandler();

		const resolveFirst = resolver<Entity>('table', 'public', firstHints);
		const resolveSecond = resolver<Entity>('table', 'public', secondHints);

		await resolveFirst({
			created: [table('members', 'public')],
			deleted: [table('users', 'public')],
		});
		await resolveSecond({
			created: [table('accounts', 'public')],
			deleted: [table('profiles', 'public')],
		});

		return { firstHints, secondHints };
	});

	expect(firstHints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] }],
	});
	expect(secondHints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'accounts'] }],
	});
});

test('toResponse renders the accumulated missing_hints payload', () => {
	const hints = new HintsHandler();
	hints.pushMissingHint({ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders'] });
	hints.pushMissingHint({
		type: 'confirm_data_loss',
		kind: 'table',
		entity: ['public', 'customers'],
		reason: 'non_empty',
	});

	expect(hints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders'] },
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'customers'], reason: 'non_empty' },
		],
	});
});

test('toResponse is stable across repeated calls on the same HintsHandler', () => {
	const hints = new HintsHandler();
	hints.pushMissingHint({ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'legacy_flag'] });

	const first = hints.toResponse();
	const second = hints.toResponse();

	expect(second).toStrictEqual(first);
});

test('new HintsHandler() produces a fresh missing hint list each time', () => {
	const firstHints = new HintsHandler();
	firstHints.pushMissingHint({ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders'] });

	const secondHints = new HintsHandler();

	expect(secondHints.hasMissingHints()).toBe(false);
	expect(firstHints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders'] }],
	});
	expect(secondHints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [],
	});
});
