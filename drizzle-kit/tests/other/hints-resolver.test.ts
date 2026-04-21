import { type Hint, HintsHandler } from 'src/cli/hints';
import { setJsonMode } from 'src/cli/mode';
import { resolver } from 'src/cli/prompts';
import { afterEach, beforeEach, expect, test } from 'vitest';

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
	const handler = new HintsHandler(hints);
	const resolve = resolver<Entity>('table', 'public', 'generate', handler);
	return { handler, result: await resolve(input) };
};

beforeEach(() => {
	setJsonMode(true);
});

afterEach(() => {
	setJsonMode(false);
});

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
	const created = table('members', 'public');
	const deleted = table('users', 'public');
	const hints = new HintsHandler();
	const resolve = resolver<Entity>('table', 'public', 'generate', hints);
	const result = await resolve({ created: [created], deleted: [deleted] });

	expect(result).toStrictEqual({
		resolved: {
			created: [created],
			deleted: [deleted],
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

test('resolver normalizes primary key entity types to primary_key hints', async () => {
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
	const resolve = resolver<Entity>(
		'primary key',
		'public',
		'generate',
		hints,
	);
	const result = await resolve({ created: [created], deleted: [deleted] });

	expect(result.resolved).toStrictEqual({
		created: [],
		deleted: [],
		renamedOrMoved: [{ from: deleted, to: created }],
	});
	expect(result.unresolved).toStrictEqual([]);
	expect(hints.missingHints).toStrictEqual([]);
});

test('resolver is idempotent for matching rename hints', async () => {
	const hints = [
		{ type: 'rename', kind: 'table', from: ['public', 'users'] as const, to: ['public', 'members'] as const },
	] as const;
	const input = {
		created: [table('members', 'public')],
		deleted: [table('users', 'public')],
	};

	const first = await resolver<Entity>('table', 'public', 'generate', new HintsHandler([...hints]))(input);
	const second = await resolver<Entity>('table', 'public', 'generate', new HintsHandler([...hints]))(input);

	expect(second).toStrictEqual(first);
});

test('resolver is idempotent for matching create hints', async () => {
	const hints = [
		{ type: 'create', kind: 'table', entity: ['public', 'members'] as const },
	] as const;
	const input = {
		created: [table('members', 'public')],
		deleted: [table('users', 'public')],
	};

	const first = await resolver<Entity>('table', 'public', 'generate', new HintsHandler([...hints]))(input);
	const second = await resolver<Entity>('table', 'public', 'generate', new HintsHandler([...hints]))(input);

	expect(second).toStrictEqual(first);
});

test('resolver returns only newly added unresolved items when reusing a HintsHandler', async () => {
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
