import { integer, jsonb, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { errorToEnvelope } from 'src/cli/errors';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import type { Delta } from 'src/dialects/dialect';
import { describe, expect, test } from 'vitest';
import {
	columnRow,
	createFolderFlow,
	type FolderFlow,
	forkFlow,
	malformedEnvelope,
	reconstructFix,
	rename,
	schemaState,
	type Step,
	step,
} from './folder-flow';

// Verifies the rules that `reconstruct` and the combined state of a merge follow for a delta that does not fit the
// state, which a hand edit of a snapshot can give. A drop, an alter or a rename of a missing entity is skipped, and
// a create of an equal entity does nothing. A create of a different entity onto a taken key stops `generate` with an
// error that names the migration folder of that delta. If a merge skips an alter delta that has no statement, the
// merge snapshot stores that change again. `migrate` runs on PGlite.

const users = pgTable('users', { id: integer() });
const usersWithEmail = pgTable('users', { id: integer(), email: varchar() });
const likes = pgTable('likes', { id: integer() });
const groups = pgTable('groups', { id: integer() });

const missingTable = 'tables\0["public","orders"]';
// Deltas of entities that the state does not hold, which the tests append to check that each one is skipped.
// The rename targets the taken name `users`, so the tests also show that a skipped rename gives no key collision.
const deltasOfMissingEntities: Delta[] = [
	{ op: 'drop', key: 'columns\0["public","orders","id"]' },
	{ op: 'alter', key: 'columns\0["public","orders","id"]', set: { notNull: true } },
	{ op: 'rename', key: missingTable, set: { name: 'users' } },
];
// A create delta row for the column users.email, with the fields in reverse order. The equal-create tests use
// it to check that the order of the fields does not matter.
const emailColumn = Object.fromEntries(Object.entries(columnRow('users', 'email', 'varchar')).reverse());

describe('a delta in the history of one leaf', () => {
	const linear = async () => {
		const flow = createFolderFlow();
		await flow.generate('main', { users });
		const { folder } = await flow.generate('main', { users: usersWithEmail });
		return { flow, folder };
	};

	test('a drop, an alter and a rename of a missing entity are skipped', async () => {
		const { flow, folder } = await linear();
		const before = flow.state('main', folder);

		flow.appendDeltas('main', folder, ...deltasOfMissingEntities);

		expect(flow.state('main', folder)).toStrictEqual(before);
		expect(await flow.tryGenerate('main', { users: usersWithEmail })).toMatchObject({ status: 'no_changes' });
	});

	test('a create of an equal entity onto a taken key does nothing, in any order of the fields', async () => {
		const { flow, folder } = await linear();
		const before = flow.state('main', folder);

		flow.appendDeltas('main', folder, { op: 'create', row: emailColumn });

		expect(flow.state('main', folder)).toStrictEqual(before);
		expect(await flow.tryGenerate('main', { users: usersWithEmail })).toMatchObject({ status: 'no_changes' });
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
});

describe('a delta that reaches a merge only through another parent', () => {
	// Builds two branches from `users`. The leaf of branch a has the older folder name, so it is not the first
	// parent, and a delta in `older` reaches the combined state only through another parent.
	const forked = async () => {
		const { flow, folders: [[older]] } = await forkFlow({
			base: { users },
			branches: [[step({ users: usersWithEmail, likes })], [step({ users, groups })]],
		});
		return { flow, older };
	};
	const merged = { users: usersWithEmail, likes, groups };
	const combinedState = async (flow: FolderFlow) =>
		normalizeDDL((await flow.stateBeforeGenerate('main')).entities.list());

	test('a drop, an alter and a rename of a missing entity are skipped, and an equal create does nothing', async () => {
		const { flow, older } = await forked();

		flow.appendDeltas('main', older, ...deltasOfMissingEntities, { op: 'create', row: emailColumn });

		expect(await combinedState(flow)).toStrictEqual(schemaState(merged));
		expect(await flow.tryGenerate('main', merged)).toMatchObject({ status: 'no_changes' });
	});

	// Both branches add the column users.email with another type. The test empties the `statements` of b, so
	// `check` passes, because it reads only the stored statements. The collision then comes from the deltas.
	test('a create of a different entity onto a taken key stops generate, and the error names the migration of that delta', async () => {
		const { flow, folders: [[a], [b]] } = await forkFlow({
			base: { users },
			branches: [
				[step({ users: usersWithEmail })],
				[step({ users: pgTable('users', { id: integer(), email: text() }) })],
			],
		});
		flow.overwriteSnapshot('main', b, JSON.stringify({ ...flow.snapshot('main', b), statements: [] }));
		const files = flow.files('main');

		expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
		const error = await flow.generate('main', { users: usersWithEmail }).catch((e) => e);

		expect(error.message).toBe(
			`Cannot reconstruct the combined state at migration ${a}: The create delta adds columns `
				+ '["public","users","email"], and another entity of columns with other values already has this key. '
				+ `Two migrations gave one name to two different entities. ${reconstructFix(a)}`,
		);
		expect(errorToEnvelope(error)).toStrictEqual(malformedEnvelope(a));
		expect(flow.files('main')).toStrictEqual(files);
	});
});

// `reordered` has the keys of `written` in another order. drizzle-kit compares jsonb defaults by their parsed
// values, so this change gives an alter delta with no statement, and `check` reads only the statements.
describe('one branch stores a delta with no statement, and the other branch renames the table of that entity', () => {
	const items = (table: string, meta: Record<string, number>) =>
		pgTable(table, { id: integer(), meta: jsonb().default(meta) });
	const [written, reordered] = [{ a: 1, b: 2 }, { b: 2, a: 1 }];
	const tags = pgTable('tags', { id: integer() });
	const notes = pgTable('notes', { id: integer() });
	const reorderBranch = [step({ items: items('items', reordered), tags })];
	const renameBranch = [step({ things: items('things', written) }, rename('table', 'public.items', 'public.things'))];
	const merged = { things: items('things', reordered), tags, notes };
	const defaultDelta = (table: string) => ({
		op: 'alter',
		key: `columns\0["public","${table}","meta"]`,
		set: { default: `'{"b":2,"a":1}'` },
	});

	const forked = (older: Step[], newer: Step[]) =>
		forkFlow({ base: { items: items('items', written) }, branches: [older, newer] });

	test('the branch with the reordered default stores an alter delta and no statement for it', async () => {
		const { flow, folders: [[folder]] } = await forked(reorderBranch, renameBranch);

		expect(flow.deltas('main', folder)).toContainEqual(defaultDelta('items'));
		expect(flow.statements('main', folder).map((it) => it.type)).toStrictEqual(['create_table']);
		expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	});

	test('with the rename as the first parent, the change is skipped, and the merge snapshot stores it again', async () => {
		const { flow } = await forked(reorderBranch, renameBranch);

		const { folder } = await flow.generate('main', merged);

		expect(flow.deltas('main', folder)).toContainEqual(defaultDelta('things'));
		expect(flow.sql('main', folder)).toBe('CREATE TABLE "notes" (\n\t"id" integer\n);\n');
		expect(flow.state('main', folder)).toStrictEqual(schemaState(merged));
		expect(await flow.migrate('main', merged)).toStrictEqual([]);
	});

	test('with the reordered default as the first parent, the rename reaches the changed column', async () => {
		const { flow } = await forked(renameBranch, reorderBranch);

		const { folder } = await flow.generate('main', merged);

		expect(flow.deltas('main', folder).map((it) => it.op)).not.toContain('alter');
		expect(flow.state('main', folder)).toStrictEqual(schemaState(merged));
		expect(await flow.migrate('main', merged)).toStrictEqual([]);
	});
});
