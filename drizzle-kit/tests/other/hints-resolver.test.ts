import { runWithCliContext } from 'src/cli/context';
import { type Hint, HintsHandler } from 'src/cli/hints';
import { resolver } from 'src/cli/prompts';
import { expect, test } from 'vitest';

type Entity = {
	name: string;
	schema?: string;
	table?: string;
	grantor?: string;
	grantee?: string;
	type?: string;
};

const table = (name: string, schema?: string): Entity => ({ name, schema });
const constraint = (tableName: string, name: string, schema?: string): Entity => ({
	name,
	table: tableName,
	schema,
});

const runTableResolver = async (
	hints: readonly Hint[],
	input: { created: Entity[]; deleted: Entity[] },
) => {
	return runWithCliContext({ output: 'json', interactive: false }, async () => {
		const handler = new HintsHandler(hints);
		const resolve = resolver<Entity>('table', handler);
		return { handler, result: await resolve(input) };
	});
};

test('resolver applies a matching rename hint and removes both sides from the diff', async () => {
	const created = table('members', 'public');
	const deleted = table('users', 'public');
	const { handler, result } = await runTableResolver(
		[
			{ type: 'rename', kind: 'table', from: ['public', 'users'] as const, to: ['public', 'members'] as const },
		],
		{ created: [created], deleted: [deleted] },
	);

	expect(result).toStrictEqual({
		created: [],
		deleted: [],
		renamedOrMoved: [{ from: deleted, to: created }],
	});
	expect(handler.missingHints).toStrictEqual([]);
});

test('resolver keeps an entity in created when a matching create hint exists', async () => {
	const created = table('members', 'public');
	const deleted = table('users', 'public');
	const { handler, result } = await runTableResolver(
		[
			{ type: 'create', kind: 'table', entity: ['public', 'members'] as const },
		],
		{ created: [created], deleted: [deleted] },
	);

	expect(result).toStrictEqual({
		created: [created],
		deleted: [deleted],
		renamedOrMoved: [],
	});
	expect(handler.missingHints).toStrictEqual([]);
});

test('resolver records a missing hint and keeps both entities when no hint matches an ambiguity', async () => {
	const { hints, result } = await runWithCliContext({ output: 'json', interactive: false }, async () => {
		const created = table('members', 'public');
		const deleted = table('users', 'public');
		const hints = new HintsHandler();
		const resolve = resolver<Entity>('table', hints);
		const result = await resolve({ created: [created], deleted: [deleted] });

		return { hints, result };
	});

	expect(result).toStrictEqual({
		created: [table('members', 'public')],
		deleted: [table('users', 'public')],
		renamedOrMoved: [],
	});
	expect(hints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] }],
	});
});

test('resolver ignores excess hints that do not correspond to the diff', async () => {
	const created = table('members', 'public');
	const { handler, result } = await runTableResolver(
		[
			{ type: 'rename', kind: 'table', from: ['public', 'ghost_old'] as const, to: ['public', 'ghost_new'] as const },
		],
		{ created: [created], deleted: [] },
	);

	expect(result).toStrictEqual({
		created: [created],
		deleted: [],
		renamedOrMoved: [],
	});
	expect(handler.missingHints).toStrictEqual([]);
});

test('resolver prefers a rename hint over a create hint for the same entity', async () => {
	const created = table('members', 'public');
	const deleted = table('users', 'public');
	const { result } = await runTableResolver(
		[
			{ type: 'create', kind: 'table', entity: ['public', 'members'] as const },
			{ type: 'rename', kind: 'table', from: ['public', 'users'] as const, to: ['public', 'members'] as const },
		],
		{ created: [created], deleted: [deleted] },
	);

	expect(result).toStrictEqual({
		created: [],
		deleted: [],
		renamedOrMoved: [{ from: deleted, to: created }],
	});
});

test('resolver matches hints against the default schema when entity schema is omitted', async () => {
	const created = table('members');
	const deleted = table('users');
	const { result } = await runTableResolver(
		[
			{ type: 'rename', kind: 'table', from: ['public', 'users'] as const, to: ['public', 'members'] as const },
		],
		{ created: [created], deleted: [deleted] },
	);

	expect(result).toStrictEqual({
		created: [],
		deleted: [],
		renamedOrMoved: [{ from: deleted, to: created }],
	});
});

test('resolver matches primary key entity types against primary key hints', async () => {
	const { created, deleted, hints, result } = await runWithCliContext(
		{ output: 'json', interactive: false },
		async () => {
			const created = constraint('users', 'members_pkey', 'public');
			const deleted = constraint('users', 'users_pkey', 'public');
			const hints = new HintsHandler([
				{
					type: 'rename',
					kind: 'primary_key',
					from: ['public', 'users', 'users_pkey'] as const,
					to: ['public', 'users', 'members_pkey'] as const,
				},
			]);
			const resolve = resolver<Entity>('primary_key', hints);

			return {
				created,
				deleted,
				hints,
				result: await resolve({ created: [created], deleted: [deleted] }),
			};
		},
	);

	expect(result).toStrictEqual({
		created: [],
		deleted: [],
		renamedOrMoved: [{ from: deleted, to: created }],
	});
	expect(hints.missingHints).toStrictEqual([]);
});

test('resolver matches default entity types against default hints', async () => {
	const { created, deleted, hints, result } = await runWithCliContext(
		{ output: 'json', interactive: false },
		async () => {
			const created = constraint('users', 'members_default', 'dbo');
			const deleted = constraint('users', 'users_default', 'dbo');
			const hints = new HintsHandler([
				{
					type: 'rename',
					kind: 'default',
					from: ['dbo', 'users', 'users_default'] as const,
					to: ['dbo', 'users', 'members_default'] as const,
				},
			]);
			const resolve = resolver<Entity>('default', hints, 'dbo');

			return {
				created,
				deleted,
				hints,
				result: await resolve({ created: [created], deleted: [deleted] }),
			};
		},
	);

	expect(result).toStrictEqual({
		created: [],
		deleted: [],
		renamedOrMoved: [{ from: deleted, to: created }],
	});
	expect(hints.missingHints).toStrictEqual([]);
});

test('resolver treats missing HintsHandler in non-interactive mode as an internal invariant failure', async () => {
	await expect(runWithCliContext({ output: 'json', interactive: false }, async () => {
		const resolve = resolver<Entity>('table');

		return resolve({
			created: [table('members', 'public')],
			deleted: [table('users', 'public')],
		});
	})).rejects.toThrow('Internal error: resolver(table) was called without a HintsHandler');
});

test('resolver returns only newly added unresolved items when reusing a HintsHandler', async () => {
	const { hints, tableDelta, columnDelta } = await runWithCliContext(
		{ output: 'json', interactive: false },
		async () => {
			const hints = new HintsHandler();
			hints.pushMissingHint({ type: 'rename_or_create', kind: 'table', entity: ['public', 'existing'] });

			const resolveTables = resolver<Entity>('table', hints);
			const resolveColumns = resolver<Entity>('column', hints);

			const beforeTable = hints.missingHints.length;
			await resolveTables({
				created: [table('members', 'public')],
				deleted: [table('users', 'public')],
			});
			const tableDelta = hints.missingHints.slice(beforeTable);

			const beforeColumn = hints.missingHints.length;
			await resolveColumns({
				created: [{ name: 'email', table: 'users', schema: 'public' }],
				deleted: [{ name: 'name', table: 'users', schema: 'public' }],
			});
			const columnDelta = hints.missingHints.slice(beforeColumn);

			return { hints, tableDelta, columnDelta };
		},
	);

	expect(tableDelta).toStrictEqual([
		{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] },
	]);
	expect(columnDelta).toStrictEqual([
		{ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'email'] },
	]);
	expect(hints.missingHints).toStrictEqual([
		{ type: 'rename_or_create', kind: 'table', entity: ['public', 'existing'] },
		{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] },
		{ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'email'] },
	]);
});
