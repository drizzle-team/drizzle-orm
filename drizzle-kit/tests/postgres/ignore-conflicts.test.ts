import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { Hint } from 'src/cli/hints';
import { expect, test } from 'vitest';
import { createFolderFlow, type FolderFlow, schemaState } from './folder-flow';

const withName = (state: string[], from: string, to: string) =>
	state.map((it) => it.replace(`"name":"${from}"`, `"name":"${to}"`)).sort();

const idsOf = (flow: FolderFlow, folders: string[]) => folders.map((it) => flow.snapshot('main', it).id);

const tags = pgTable('tags', { id: integer() });

// Both branches drop "note" and set different defaults on "score", so check reports conflicts.
const conflictingFork = async (flow: FolderFlow) => {
	await flow.generate('main', { users: pgTable('users', { id: integer(), note: varchar(), score: integer() }) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: pgTable('users', { id: integer(), score: integer().default(1) }), tags });
	await flow.generate('b', { users: pgTable('users', { id: integer(), score: integer().default(2) }) });
	flow.merge('main', 'a', 'b');
	expect(await flow.check('main')).toMatchObject({ status: 'conflicts' });
};

const resolvedConflictingFork = { users: pgTable('users', { id: integer(), score: integer().default(3) }), tags };

test('both branches drop a column and set different defaults, and the merge takes the default from the schema', async () => {
	const flow = createFolderFlow();
	await conflictingFork(flow);

	const { folder } = await flow.generate('main', resolvedConflictingFork, { ignoreConflicts: true });

	expect(folder).toBe('20260101120004_main');
	// The SQL starts from b, the newest leaf, so it creates "tags" again after a created it.
	expect(flow.sql('main', folder!)).toBe(
		'CREATE TABLE "tags" (\n\t"id" integer\n);\n--> statement-breakpoint\n'
			+ 'ALTER TABLE "users" ALTER COLUMN "score" SET DEFAULT 3;',
	);
	expect(flow.snapshot('main', folder!).prevIds).toStrictEqual(idsOf(flow, ['20260101120003_b', '20260101120002_a']));
	// b has no "note" any more, so the combined state skips the drop from a, and it takes "tags" and the default from a.
	expect(flow.combinedState('main', folder!)).toStrictEqual(
		schemaState({ users: pgTable('users', { id: integer(), score: integer().default(1) }), tags }),
	);
	expect(flow.snapshot('main', folder!)).toMatchObject({
		type: 'diff',
		deltas: [{ op: 'alter', key: 'columns\0["public","users","score"]', set: { default: '3' } }],
	});
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(resolvedConflictingFork));

	const unchanged = await flow.generate('main', resolvedConflictingFork);

	expect(unchanged.status).toBe('no_changes');
	expect(flow.folders('main')).toStrictEqual([
		'20260101120001_main',
		'20260101120002_a',
		'20260101120003_b',
		'20260101120004_main',
	]);
});

test('a merge with ignored conflicts has the same combined state, deltas and state when it is generated again', async () => {
	const flow = createFolderFlow();
	await conflictingFork(flow);

	const first = (await flow.generate('main', resolvedConflictingFork, { ignoreConflicts: true })).folder!;
	const firstSnapshot = flow.snapshot('main', first);
	const firstCombined = flow.combinedState('main', first);
	const firstState = flow.state('main', first);
	flow.deleteFolder('main', first);
	const second = (await flow.generate('main', resolvedConflictingFork, { ignoreConflicts: true })).folder!;

	expect(second).not.toBe(first);
	expect(flow.combinedState('main', second)).toStrictEqual(firstCombined);
	expect(flow.snapshot('main', second)).toStrictEqual({ ...firstSnapshot, id: flow.snapshot('main', second).id });
	expect(flow.state('main', second)).toStrictEqual(firstState);
});

test('a rename decided in a merge with ignored conflicts is stored as a rename', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', {
		users: pgTable('users', { id: integer(), email: varchar().unique(), score: integer() }),
	});
	// After the table rename the unique constraint keeps its first name, "users_email_key".
	await flow.generate('main', {
		people: pgTable('people', { id: integer(), email: varchar().unique(), score: integer() }),
	}, {
		hints: [{ type: 'rename', kind: 'table', from: ['public', 'users'], to: ['public', 'people'] }],
	});
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', {
		people: pgTable('people', { id: integer(), email: varchar().unique(), score: integer().default(1) }),
	});
	await flow.generate('b', {
		people: pgTable('people', { id: integer(), email: varchar().unique(), score: integer().default(2) }),
	});
	flow.merge('main', 'a', 'b');
	expect(await flow.check('main')).toMatchObject({ status: 'conflicts' });
	const resolved = {
		people: pgTable('people', { id: integer(), email: varchar().unique(), points: integer().default(3) }),
	};

	const { folder } = await flow.generate('main', resolved, {
		ignoreConflicts: true,
		hints: [{
			type: 'rename',
			kind: 'column',
			from: ['public', 'people', 'score'],
			to: ['public', 'people', 'points'],
		}],
	});

	expect(flow.sql('main', folder!)).toBe(
		'ALTER TABLE "people" RENAME COLUMN "score" TO "points";--> statement-breakpoint\n'
			+ 'ALTER TABLE "people" ALTER COLUMN "points" SET DEFAULT 3;',
	);
	expect(flow.snapshot('main', folder!)).toMatchObject({
		deltas: [
			{ op: 'rename', key: 'columns\0["public","people","score"]', set: { name: 'points' } },
			{ op: 'alter', key: 'columns\0["public","people","points"]', set: { default: '3' } },
		],
	});
	expect(flow.state('main', folder!)).toStrictEqual(
		withName(schemaState(resolved), 'people_email_key', 'users_email_key'),
	);
	expect(await flow.migrate('main', resolved)).toStrictEqual([]);

	const unchanged = await flow.generate('main', resolved);

	expect(unchanged.status).toBe('no_changes');
	expect(flow.leaves('main')).toStrictEqual([folder]);
});

test('a rename in a merge with ignored conflicts becomes a drop when the combined state already has the new name', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users: pgTable('users', { id: integer(), a: varchar(), score: integer() }) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', {
		users: pgTable('users', { id: integer(), a: varchar(), b: varchar(), score: integer().default(1) }),
	});
	await flow.generate('b', { users: pgTable('users', { id: integer(), a: varchar(), score: integer().default(2) }) });
	flow.merge('main', 'a', 'b');
	expect(await flow.check('main')).toMatchObject({ status: 'conflicts' });
	const resolved = {
		users: pgTable('users', { id: integer(), b: varchar(), c: varchar(), score: integer().default(3) }),
	};

	const { folder } = await flow.generate('main', resolved, {
		ignoreConflicts: true,
		hints: [{ type: 'rename', kind: 'column', from: ['public', 'users', 'a'], to: ['public', 'users', 'b'] }],
	});

	expect(flow.sql('main', folder!)).toContain('ALTER TABLE "users" RENAME COLUMN "a" TO "b";');
	expect(flow.deltas('main', folder!)).toHaveLength(3);
	expect(flow.deltas('main', folder!)).toStrictEqual(expect.arrayContaining([
		expect.objectContaining({ op: 'create', row: expect.objectContaining({ table: 'users', name: 'c' }) }),
		{ op: 'drop', key: 'columns\0["public","users","a"]' },
		{ op: 'alter', key: 'columns\0["public","users","score"]', set: { default: '3' } },
	]));
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(resolved));
});

test('a merge with ignored conflicts keeps the constraint names that its SQL leaves in the database', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', { users: pgTable('users', { id: integer(), email: varchar().unique() }) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	const tableRename: Hint = { type: 'rename', kind: 'table', from: ['public', 'users'], to: ['public', 'people'] };
	// a drops the unique constraint and adds it again, so the constraint gets the name "people_email_key".
	await flow.generate('a', { people: pgTable('people', { id: integer(), email: varchar() }) }, {
		hints: [tableRename],
	});
	await flow.generate('a', { people: pgTable('people', { id: integer(), email: varchar().unique() }) });
	// b is the newest leaf, and its constraint keeps the name "users_email_key".
	await flow.generate('b', { people: pgTable('people', { id: integer(), email: varchar().unique() }) }, {
		hints: [tableRename],
	});
	flow.merge('main', 'a', 'b');
	expect(await flow.check('main')).toMatchObject({ status: 'conflicts' });
	const resolved = { people: pgTable('people', { id: integer(), email: varchar().unique(), x: integer() }) };

	const { folder } = await flow.generate('main', resolved, { ignoreConflicts: true });

	expect(folder).toBe('20260101120005_main');
	expect(flow.sql('main', folder!)).toBe('ALTER TABLE "people" ADD COLUMN "x" integer;');
	expect(flow.deltas('main', folder!)).toHaveLength(3);
	expect(flow.deltas('main', folder!)).toStrictEqual(expect.arrayContaining([
		expect.objectContaining({ op: 'create', row: expect.objectContaining({ table: 'people', name: 'x' }) }),
		{ op: 'drop', key: 'uniques\0["public","people","people_email_key"]' },
		expect.objectContaining({
			op: 'create',
			row: expect.objectContaining({ entityType: 'uniques', table: 'people', name: 'users_email_key' }),
		}),
	]));
	expect(flow.state('main', folder!)).toStrictEqual(
		withName(schemaState(resolved), 'people_email_key', 'users_email_key'),
	);

	const withoutUnique = { people: pgTable('people', { id: integer(), email: varchar(), x: integer() }) };
	const next = (await flow.generate('main', withoutUnique)).folder!;

	expect(flow.sql('main', next)).toBe('ALTER TABLE "people" DROP CONSTRAINT "users_email_key";');
	// The merge SQL starts from b, so it applies to a database that ran main and b.
	expect(await flow.migrate('main', withoutUnique, ['20260101120001_main', '20260101120004_b', folder!, next]))
		.toStrictEqual([]);
});
