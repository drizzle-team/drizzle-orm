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
	return runWithCliContext({ json: true }, async () => {
		const handler = new HintsHandler(hints);
		const resolve = resolver<Entity>('table', 'public', 'generate', handler);
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
		resolved: {
			created: [],
			deleted: [],
			renamedOrMoved: [{ from: deleted, to: created }],
		},
		unresolved: [],
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
		resolved: {
			created: [created],
			deleted: [deleted],
			renamedOrMoved: [],
		},
		unresolved: [],
	});
	expect(handler.missingHints).toStrictEqual([]);
});

test('resolver records a missing hint and keeps both entities when no hint matches an ambiguity', async () => {
	const { hints, result } = await runWithCliContext({ json: true }, async () => {
		const created = table('members', 'public');
		const deleted = table('users', 'public');
		const hints = new HintsHandler();
		const resolve = resolver<Entity>('table', 'public', 'generate', hints);
		const result = await resolve({ created: [created], deleted: [deleted] });

		return { hints, result };
	});

	expect(result).toStrictEqual({
		resolved: {
			created: [table('members', 'public')],
			deleted: [table('users', 'public')],
			renamedOrMoved: [],
		},
		unresolved: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] }],
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
		resolved: {
			created: [created],
			deleted: [],
			renamedOrMoved: [],
		},
		unresolved: [],
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

	expect(result.resolved).toStrictEqual({
		created: [],
		deleted: [],
		renamedOrMoved: [{ from: deleted, to: created }],
	});
	expect(result.unresolved).toStrictEqual([]);
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

	expect(result.resolved).toStrictEqual({
		created: [],
		deleted: [],
		renamedOrMoved: [{ from: deleted, to: created }],
	});
	expect(result.unresolved).toStrictEqual([]);
});

test('resolver matches primary key entity types against primary key hints', async () => {
	const { created, deleted, hints, result } = await runWithCliContext({ json: true }, async () => {
		const created = constraint('users', 'members_pkey', 'public');
		const deleted = constraint('users', 'users_pkey', 'public');
		const hints = new HintsHandler([
			{
				type: 'rename',
				kind: 'primary key',
				from: ['public', 'users', 'users_pkey'] as const,
				to: ['public', 'users', 'members_pkey'] as const,
			},
		]);
		const resolve = resolver<Entity>(
			'primary key',
			'public',
			'generate',
			hints,
		);

		return {
			created,
			deleted,
			hints,
			result: await resolve({ created: [created], deleted: [deleted] }),
		};
	});

	expect(result.resolved).toStrictEqual({
		created: [],
		deleted: [],
		renamedOrMoved: [{ from: deleted, to: created }],
	});
	expect(result.unresolved).toStrictEqual([]);
	expect(hints.missingHints).toStrictEqual([]);
});

test('resolver matches default entity types against default hints', async () => {
	const { created, deleted, hints, result } = await runWithCliContext({ json: true }, async () => {
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
		const resolve = resolver<Entity>(
			'default',
			'dbo',
			'generate',
			hints,
		);

		return {
			created,
			deleted,
			hints,
			result: await resolve({ created: [created], deleted: [deleted] }),
		};
	});

	expect(result.resolved).toStrictEqual({
		created: [],
		deleted: [],
		renamedOrMoved: [{ from: deleted, to: created }],
	});
	expect(result.unresolved).toStrictEqual([]);
	expect(hints.missingHints).toStrictEqual([]);
});

test('resolver treats missing HintsHandler in json mode as an internal invariant failure', async () => {
	await expect(runWithCliContext({ json: true }, async () => {
		const resolve = resolver<Entity>('table', 'public', 'generate');

		return resolve({
			created: [table('members', 'public')],
			deleted: [table('users', 'public')],
		});
	})).rejects.toThrow('Internal error: resolver(table) was called in JSON mode without a HintsHandler');
});

test('resolver is idempotent for matching rename hints', async () => {
	await runWithCliContext({ json: true }, async () => {
		const hints = [
			{ type: 'rename', kind: 'table', from: ['public', 'users'] as const, to: ['public', 'members'] as const },
		] satisfies readonly Hint[];
		const input = {
			created: [table('members', 'public')],
			deleted: [table('users', 'public')],
		};

		const first = await resolver<Entity>('table', 'public', 'generate', new HintsHandler([...hints]))(input);
		const second = await resolver<Entity>('table', 'public', 'generate', new HintsHandler([...hints]))(input);

		expect(second).toStrictEqual(first);
	});
});

test('resolver is idempotent for matching create hints', async () => {
	await runWithCliContext({ json: true }, async () => {
		const hints = [
			{ type: 'create', kind: 'table', entity: ['public', 'members'] as const },
		] satisfies readonly Hint[];
		const input = {
			created: [table('members', 'public')],
			deleted: [table('users', 'public')],
		};

		const first = await resolver<Entity>('table', 'public', 'generate', new HintsHandler([...hints]))(input);
		const second = await resolver<Entity>('table', 'public', 'generate', new HintsHandler([...hints]))(input);

		expect(second).toStrictEqual(first);
	});
});

test('resolver returns only newly added unresolved items when reusing a HintsHandler', async () => {
	const { hints, tableResult, columnResult } = await runWithCliContext({ json: true }, async () => {
		const hints = new HintsHandler();
		hints.pushMissingHint({ type: 'rename_or_create', kind: 'table', entity: ['public', 'existing'] });

		const resolveTables = resolver<Entity>('table', 'public', 'generate', hints);
		const resolveColumns = resolver<Entity>('column', 'public', 'generate', hints);
		const tableResult = await resolveTables({
			created: [table('members', 'public')],
			deleted: [table('users', 'public')],
		});
		const columnResult = await resolveColumns({
			created: [{ name: 'email', table: 'users', schema: 'public' }],
			deleted: [{ name: 'name', table: 'users', schema: 'public' }],
		});

		return { hints, tableResult, columnResult };
	});

	expect(tableResult.unresolved).toStrictEqual([
		{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] },
	]);
	expect(columnResult.unresolved).toStrictEqual([
		{ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'email'] },
	]);
	expect(hints.missingHints).toStrictEqual([
		{ type: 'rename_or_create', kind: 'table', entity: ['public', 'existing'] },
		{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] },
		{ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'email'] },
	]);
});
