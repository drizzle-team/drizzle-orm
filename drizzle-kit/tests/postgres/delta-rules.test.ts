import { integer, jsonb, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { errorToEnvelope } from 'src/cli/errors';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import type { Delta } from 'src/dialects/dialect';
import { describe, expect, test } from 'vitest';
import {
	columnRow,
	createFolderFlow,
	type FolderFlow,
	malformedEnvelope,
	reconstructFix,
	schemaState,
} from './folder-flow';
import type { PostgresSchema } from './mocks';

// A hand edit of a snapshot gives a delta that does not fit the state. The rules for such a delta are the
// same in the history of one leaf and in the combined state of several leaves.
const users = pgTable('users', { id: integer() });
const usersWithEmail = pgTable('users', { id: integer(), email: varchar() });
const likes = pgTable('likes', { id: integer() });
const groups = pgTable('groups', { id: integer() });

const missingTable = 'tables\0["public","orders"]';
// A drop, an alter and a rename of entities that the state does not hold. Without the skip, the rename would
// move the table users onto the name of the missing table.
const deltasOfMissingEntities: Delta[] = [
	{ op: 'drop', key: 'columns\0["public","orders","id"]' },
	{ op: 'alter', key: 'columns\0["public","orders","id"]', set: { notNull: true } },
	{ op: 'rename', key: missingTable, set: { name: 'users' } },
];
// The fields of the column users.email in another order than generate writes them.
const emailColumn = Object.fromEntries(Object.entries(columnRow('users', 'email', 'varchar')).reverse());

describe('a delta in the history of one leaf', () => {
	const linear = async () => {
		const flow = createFolderFlow();
		await flow.generate('main', { users });
		const { folder } = await flow.generate('main', { users: usersWithEmail });
		return { flow, folder: folder! };
	};

	test('a drop, an alter and a rename of a missing entity are skipped', async () => {
		const { flow, folder } = await linear();
		const before = flow.state('main', folder);

		flow.appendDeltas('main', folder, ...deltasOfMissingEntities);

		expect(flow.state('main', folder)).toStrictEqual(before);
		expect(await flow.generate('main', { users: usersWithEmail })).toMatchObject({ status: 'no_changes' });
	});

	test('a create of an equal entity onto a taken key does nothing, in any order of the fields', async () => {
		const { flow, folder } = await linear();
		const before = flow.state('main', folder);

		flow.appendDeltas('main', folder, { op: 'create', row: emailColumn });

		expect(flow.state('main', folder)).toStrictEqual(before);
		expect(await flow.generate('main', { users: usersWithEmail })).toMatchObject({ status: 'no_changes' });
	});

	test('a create of a different entity onto a taken key stops generate, and the error names the leaf and the entity', async () => {
		const { flow, folder } = await linear();
		flow.appendDeltas('main', folder, { op: 'create', row: { ...emailColumn, type: 'text' } });
		const files = flow.files('main');

		const error = await flow.generate('main', { users: usersWithEmail }).catch((e) => e);

		expect(error.message).toBe(
			`Cannot reconstruct the state of migration ${folder}: The create delta adds columns `
				+ '["public","users","email"], and another entity of columns with other values already has this key. '
				+ `Two migrations gave one name to two different entities. ${reconstructFix(folder)}`,
		);
		expect(errorToEnvelope(error)).toStrictEqual(malformedEnvelope(folder));
		expect(flow.files('main')).toStrictEqual(files);
	});

	test('a rename that moves a referencing entity onto a taken key stops generate', async () => {
		const { flow, folder } = await linear();
		// A column of a table `accounts` that the state does not hold. The rename of the table users moves the
		// column users.id onto its key.
		flow.appendDeltas(
			'main',
			folder,
			{ op: 'create', row: columnRow('accounts', 'id') },
			{ op: 'rename', key: 'tables\0["public","users"]', set: { name: 'accounts' } },
		);

		const error = await flow.generate('main', { users: usersWithEmail }).catch((e) => e);

		expect(error.message).toBe(
			`Cannot reconstruct the state of migration ${folder}: The rename delta moves tables ["public","users"] to `
				+ '["public","accounts"], and it also moves an entity of columns onto the key ["public","accounts","id"], '
				+ 'which another entity of columns already has. Two migrations gave one name to two different entities. '
				+ reconstructFix(folder),
		);
		expect(errorToEnvelope(error)).toStrictEqual(malformedEnvelope(folder));
	});

	test('an alter whose fields change the key gives the same state as a rename with those fields', async () => {
		const { flow, folder } = await linear();
		flow.branch('alter', 'main');
		flow.branch('rename', 'main');
		const change = { key: 'tables\0["public","users"]', set: { name: 'accounts' } };

		flow.appendDeltas('alter', folder, { op: 'alter', ...change });
		flow.appendDeltas('rename', folder, { op: 'rename', ...change });

		const renamed = { accounts: pgTable('accounts', { id: integer(), email: varchar() }) };
		expect(flow.state('rename', folder)).toStrictEqual(schemaState(renamed));
		expect(flow.state('alter', folder)).toStrictEqual(schemaState(renamed));
	});
});

describe('a delta that reaches a merge only through another parent', () => {
	// The leaf of branch a is not the first parent, because its folder name is older.
	const forked = async () => {
		const flow = createFolderFlow();
		await flow.generate('main', { users });
		flow.branch('a', 'main');
		flow.branch('b', 'main');
		const a = await flow.generate('a', { users: usersWithEmail, likes });
		const b = await flow.generate('b', { users, groups });
		flow.merge('main', 'a', 'b');
		return { flow, older: a.folder!, newer: b.folder! };
	};
	const merged = { users: usersWithEmail, likes, groups };
	const combinedState = async (flow: FolderFlow, schema: PostgresSchema) =>
		normalizeDDL((await flow.stateBeforeGenerate('main', schema)).entities.list());

	test('a drop, an alter and a rename of a missing entity are skipped, and an equal create does nothing', async () => {
		const { flow, older } = await forked();

		flow.appendDeltas('main', older, ...deltasOfMissingEntities, { op: 'create', row: emailColumn });

		expect(await combinedState(flow, merged)).toStrictEqual(schemaState(merged));
		expect(await flow.generate('main', merged)).toMatchObject({ status: 'no_changes' });
	});

	// Both branches add the column users.email with another type. check reads the stored statements, so it
	// passes when the statements of one branch are gone.
	test('a create of a different entity onto a taken key stops generate, and the error names the migration of that delta', async () => {
		const flow = createFolderFlow();
		await flow.generate('main', { users });
		flow.branch('a', 'main');
		flow.branch('b', 'main');
		const a = await flow.generate('a', { users: usersWithEmail });
		const b = await flow.generate('b', { users: pgTable('users', { id: integer(), email: text() }) });
		flow.merge('main', 'a', 'b');
		flow.overwriteSnapshot('main', b.folder!, JSON.stringify({ ...flow.snapshot('main', b.folder!), statements: [] }));
		const files = flow.files('main');

		expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
		expect(await flow.schemaWarnings('main', { users: usersWithEmail })).toStrictEqual([{
			kind: 'not_compared',
			message: expect.stringContaining(`Cannot reconstruct the combined state at migration ${a.folder}: `),
		}]);
		const error = await flow.generate('main', { users: usersWithEmail }).catch((e) => e);

		expect(error.message).toBe(
			`Cannot reconstruct the combined state at migration ${a.folder}: The create delta adds columns `
				+ '["public","users","email"], and another entity of columns with other values already has this key. '
				+ `Two migrations gave one name to two different entities. ${reconstructFix(a.folder!)}`,
		);
		expect(errorToEnvelope(error)).toStrictEqual(malformedEnvelope(a.folder!));
		expect(flow.files('main')).toStrictEqual(files);
	});

	test('an alter whose fields change the key renames the entity and reaches its columns', async () => {
		const { flow, older } = await forked();

		flow.appendDeltas('main', older, { op: 'alter', key: 'tables\0["public","likes"]', set: { name: 'reactions' } });

		const renamed = { users: usersWithEmail, reactions: pgTable('reactions', { id: integer() }), groups };
		expect(await combinedState(flow, renamed)).toStrictEqual(schemaState(renamed));
	});

	// The first parent holds a column of a table `reactions` that it does not hold. The leaf of branch a
	// reconstructs alone, and its rename moves the column likes.id onto the key of that column only in the
	// combined state.
	test('a rename that moves a referencing entity onto a taken key stops generate', async () => {
		const { flow, older, newer } = await forked();
		flow.appendDeltas('main', older, { op: 'rename', key: 'tables\0["public","likes"]', set: { name: 'reactions' } });
		flow.appendDeltas('main', newer, { op: 'create', row: columnRow('reactions', 'id') });

		const error = await flow.generate('main', merged).catch((e) => e);

		expect(error.message).toBe(
			`Cannot reconstruct the combined state at migration ${older}: The rename delta moves tables `
				+ '["public","likes"] to ["public","reactions"], and it also moves an entity of columns onto the key '
				+ '["public","reactions","id"], which another entity of columns already has. Two migrations gave one '
				+ `name to two different entities. ${reconstructFix(older)}`,
		);
		expect(errorToEnvelope(error)).toStrictEqual(malformedEnvelope(older));
	});
});

// drizzle-kit compares two jsonb defaults by their parsed values. So another order of the keys changes the
// state and writes no SQL, and check compares only the stored statements.
describe('one branch stores a delta with no statement, and the other branch renames the table of that entity', () => {
	const items = (table: string, meta: Record<string, number>) =>
		pgTable(table, { id: integer(), meta: jsonb().default(meta) });
	const [written, reordered] = [{ a: 1, b: 2 }, { b: 2, a: 1 }];
	const tags = pgTable('tags', { id: integer() });
	const notes = pgTable('notes', { id: integer() });
	const branches = {
		reorder: { schema: { items: items('items', reordered), tags }, hints: [] },
		rename: {
			schema: { things: items('things', written) },
			hints: [{ type: 'rename', kind: 'table', from: ['public', 'items'], to: ['public', 'things'] }] as const,
		},
	};
	const merged = { things: items('things', reordered), tags, notes };
	const defaultDelta = (table: string) => ({
		op: 'alter',
		key: `columns\0["public","${table}","meta"]`,
		set: { default: `'{"b":2,"a":1}'` },
	});

	const forked = async (older: keyof typeof branches, newer: keyof typeof branches) => {
		const flow = createFolderFlow();
		await flow.generate('main', { items: items('items', written) });
		flow.branch('reorder', 'main');
		flow.branch('rename', 'main');
		const folders = {
			[older]: (await flow.generate(older, branches[older].schema, { hints: [...branches[older].hints] })).folder!,
			[newer]: (await flow.generate(newer, branches[newer].schema, { hints: [...branches[newer].hints] })).folder!,
		};
		flow.merge('main', 'reorder', 'rename');
		return { flow, folders };
	};

	test('the branch with the reordered default stores an alter delta and no statement for it', async () => {
		const { flow, folders } = await forked('reorder', 'rename');

		expect(flow.deltas('main', folders.reorder)).toContainEqual(defaultDelta('items'));
		expect(flow.statements('main', folders.reorder).map((it) => it.type)).toStrictEqual(['create_table']);
		expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	});

	test('with the rename as the first parent, the change is skipped, and the merge snapshot stores it again', async () => {
		const { flow } = await forked('reorder', 'rename');

		const { folder } = await flow.generate('main', merged);

		expect(flow.deltas('main', folder!)).toContainEqual(defaultDelta('things'));
		expect(flow.sql('main', folder!)).toBe('CREATE TABLE "notes" (\n\t"id" integer\n);\n');
		expect(flow.state('main', folder!)).toStrictEqual(schemaState(merged));
		expect(await flow.migrate('main', merged)).toStrictEqual([]);
	});

	test('with the reordered default as the first parent, the rename reaches the changed column', async () => {
		const { flow } = await forked('rename', 'reorder');

		const { folder } = await flow.generate('main', merged);

		expect(flow.deltas('main', folder!).map((it) => it.op)).not.toContain('alter');
		expect(flow.state('main', folder!)).toStrictEqual(schemaState(merged));
		expect(await flow.migrate('main', merged)).toStrictEqual([]);
	});
});
