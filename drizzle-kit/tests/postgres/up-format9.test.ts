import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgSchema,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { cpSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CommandOutputCliError, errorToEnvelope } from 'src/cli/errors';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { type PostgresSnapshotV8, snapshotValidator } from 'src/dialects/postgres/snapshot';
import { updateUpToV6 } from 'src/dialects/postgres/versions';
import { expect, test } from 'vitest';
import { ORIGIN, writeSnapshot } from '../other/check-fixtures';
import { createFolderFlow, type FolderFlow, schemaState, tempDir } from './folder-flow';

// drizzle-kit 1.0.0-rc.4 wrote the format 8 folders. Its check passed on the linear, renames and merge
// folders, and reported a conflict between the two leaves of the fork folder. drizzle-kit 0.31.7 with
// drizzle-orm 0.44.1 wrote the format 7 folder, where the last migration renames the table posts to
// articles and the column users.email to contact. The format 4 and format 5 folders come from this
// repository's history, where an example project and the integration tests kept them.
const fixtures = join(__dirname, 'old-snapshots');

const readFixture = (...parts: string[]) => JSON.parse(readFileSync(join(fixtures, ...parts), 'utf8'));

const seedFormat8 = (name: string) => {
	const flow = createFolderFlow();
	flow.seed('main', join(fixtures, name));
	const original = new Map(
		flow.folders('main').map((folder) => [folder, flow.snapshot('main', folder) as unknown as PostgresSnapshotV8]),
	);
	return { flow, original };
};

// Every converted snapshot must rebuild to the state that its format 8 file stores.
const expectOriginalStates = (flow: FolderFlow, original: Map<string, PostgresSnapshotV8>) => {
	expect(flow.folders('main')).toStrictEqual([...original.keys()]);
	for (const [folder, it] of original) {
		expect(flow.state('main', folder)).toStrictEqual(normalizeDDL(it.ddl));
	}
};

test('up converts a linear format 8 history', async () => {
	const { flow, original } = seedFormat8('format-8-linear');
	const role = pgEnum('role', ['admin', 'user']);
	const users = pgTable('users', {
		id: integer().primaryKey(),
		email: varchar().notNull(),
		name: text(),
		role: role().default('user'),
	}, (t) => [index('users_email_idx').on(t.email)]);
	const posts = pgTable('posts', { id: integer().primaryKey(), authorId: integer().references(() => users.id) });

	await expect(flow.check('main')).rejects.toThrow('please run "drizzle-kit up"');
	const upgraded = await flow.up('main');

	expect(upgraded).toHaveLength(3);
	const snapshots = flow.folders('main').map((folder) => flow.snapshot('main', folder));
	expect(snapshots.map((it) => it.id)).toStrictEqual([...original.values()].map((it) => it.id));
	expect(snapshots.map((it) => [it.type, it.version])).toStrictEqual([['base', '9'], ['diff', '9'], ['diff', '9']]);
	expect(snapshots.map((it) => it.prevIds)).toStrictEqual([[ORIGIN], [snapshots[0].id], [snapshots[1].id]]);
	for (const it of snapshots) {
		expect(snapshotValidator.parse(it).success).toBe(true);
		expect(it).not.toHaveProperty('renames');
	}
	expectOriginalStates(flow, original);
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', { role, users, posts })).toStrictEqual([]);
	expect(await flow.up('main')).toStrictEqual([]);
});

test('up turns format 8 renames into rename deltas', async () => {
	const { flow, original } = seedFormat8('format-8-renames');
	const core = pgSchema('core');
	const schema = {
		core,
		items: core.table('items', { id: integer() }),
		accounts: pgTable('accounts', { id: integer().primaryKey(), contact: varchar() }, (t) => [
			index('contact_idx').on(t.contact),
		]),
	};

	expect(original.get('20260928150356_contact')!.renames).toStrictEqual(['public.users.email->public.users.contact']);
	await flow.up('main');

	const renamesIn = (folder: string) => flow.deltas('main', folder).filter((it) => it.op === 'rename');
	expect(renamesIn('20260928150356_contact')).toStrictEqual([
		{ op: 'rename', key: 'columns\0["public","users","email"]', set: { name: 'contact' } },
	]);
	expect(renamesIn('20260928150358_accounts')).toStrictEqual([
		{ op: 'rename', key: 'tables\0["public","users"]', set: { name: 'accounts' } },
	]);
	expect(renamesIn('20260928150359_core')).toStrictEqual([
		{ op: 'rename', key: 'schemas\0["app"]', set: { name: 'core' } },
	]);
	// The dropped index "email" has the same qualified name as the renamed column, and another index is
	// created next to it, so the column's rename string also reaches the index resolver.
	expect(flow.deltas('main', '20260928150356_contact')).toContainEqual({
		op: 'drop',
		key: 'indexes\0["public","users","email"]',
	});
	expect(flow.deltas('main', '20260928150356_contact')).toContainEqual({
		op: 'create',
		row: expect.objectContaining({ entityType: 'indexes', name: 'contact_idx' }),
	});
	for (const folder of ['20260928150358_accounts', '20260928150359_core']) {
		expect(flow.deltas('main', folder).map((it) => it.op)).not.toContain('create');
		expect(flow.deltas('main', folder).map((it) => it.op)).not.toContain('drop');
	}
	expectOriginalStates(flow, original);
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', schema)).toStrictEqual([]);
});

test('up converts a format 8 merge and lists the newest parent first', async () => {
	const { flow, original } = seedFormat8('format-8-merge');
	const likes = original.get('20260928145220_likes')!;
	const groups = original.get('20260928145222_groups')!;
	const schema = {
		users: pgTable('users', { id: integer(), email: varchar() }),
		reactions: pgTable('reactions', { id: integer() }),
		groups: pgTable('groups', { id: integer() }),
	};

	expect(original.get('20260928145236_merge')!.prevIds).toStrictEqual([likes.id, groups.id]);
	await flow.up('main');

	expect(flow.snapshot('main', '20260928145236_merge').prevIds).toStrictEqual([groups.id, likes.id]);
	expect(flow.deltas('main', '20260928145236_merge')).toContainEqual({
		op: 'rename',
		key: 'tables\0["public","likes"]',
		set: { name: 'reactions' },
	});
	expectOriginalStates(flow, original);
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', schema)).toStrictEqual([]);
});

test('check reports the same conflict after up converts a format 8 fork', async () => {
	const { flow, original } = seedFormat8('format-8-fork');

	await flow.up('main');

	expectOriginalStates(flow, original);
	expect(await flow.check('main')).toMatchObject({
		status: 'conflicts',
		folders: ['20260928145239_not_null', '20260928145241_integer'],
	});
});

test('up keeps a generated constraint name that a format 8 file stores after a table rename', async () => {
	const { flow, original } = seedFormat8('format-8-renames');
	// After the table rename the primary key keeps the name users_pkey in the diff, and this file stores
	// the new default name.
	const folder = '20260928150358_accounts';
	const tampered = original.get(folder)!;
	for (const row of tampered.ddl) if (row.entityType === 'pks') row.name = 'accounts_pkey';
	flow.overwriteSnapshot('main', folder, JSON.stringify(tampered, null, 2));

	await flow.up('main');

	expectOriginalStates(flow, original);
	expect(flow.state('main', folder).filter((it) => it.includes('"pks"')).map((it) => JSON.parse(it).name))
		.toStrictEqual(['accounts_pkey']);
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
});

test('up writes nothing when a format 8 snapshot is malformed', async () => {
	const { flow } = seedFormat8('format-8-linear');
	const folder = '20260928145209_posts';
	const broken: Partial<PostgresSnapshotV8> = { ...(flow.snapshot('main', folder) as unknown as PostgresSnapshotV8) };
	delete broken.ddl;
	flow.overwriteSnapshot('main', folder, JSON.stringify(broken, null, 2));
	const before = flow.folders('main').map((it) => flow.snapshot('main', it));

	const error = await flow.up('main').catch((e: unknown) => e);

	expect(error).toBeInstanceOf(CommandOutputCliError);
	expect((error as Error).message).toContain(
		`Cannot convert migration ${folder} to snapshot format 9: its snapshot.json is malformed. No snapshot was converted. Restore `,
	);
	expect(errorToEnvelope(error)).toStrictEqual({
		status: 'error',
		error: {
			code: 'command_output_error',
			command: 'up',
			kind: 'malformed',
			snapshot: expect.stringContaining(join(folder, 'snapshot.json')),
		},
	});
	expect(flow.folders('main').map((it) => flow.snapshot('main', it))).toStrictEqual(before);
});

// Checks that every file of an old linear folder became format 9 with its parent link, and that each
// snapshot rebuilds to the given state.
const expectConverted = (
	flow: FolderFlow,
	originals: Record<string, any>[],
	states: string[][],
) => {
	const folders = flow.folders('main');
	const snapshots = folders.map((folder) => flow.snapshot('main', folder));
	expect(snapshots.map((it) => it.id)).toStrictEqual(originals.map((it) => it.id));
	expect(snapshots.map((it) => it.type)).toStrictEqual(originals.map((_, idx) => (idx === 0 ? 'base' : 'diff')));
	expect(snapshots.map((it) => it.prevIds)).toStrictEqual(
		originals.map((_, idx) => (idx === 0 ? [ORIGIN] : [originals[idx - 1].id])),
	);
	for (const [idx, folder] of folders.entries()) {
		expect(snapshotValidator.parse(snapshots[idx]).success).toBe(true);
		expect(flow.state('main', folder)).toStrictEqual(states[idx]);
	}
};

const patchRows = (state: string[], patch: (row: Record<string, any>) => Record<string, any>) =>
	normalizeDDL(state.map((it) => patch(JSON.parse(it))));

test('up converts a format 4 folder to format 9', async () => {
	const flow = createFolderFlow();
	const init = readFixture('format-4', '20230203200203', 'snapshot.json');
	// The repository history has only one postgres format 4 snapshot, so the test writes its child.
	const age = { name: 'age', type: 'integer', primaryKey: false, notNull: false };
	const child = {
		...init,
		id: 'b7a0f9c2-6f0e-4d7e-9a53-1f2d3c4b5a69',
		prevId: init.id,
		tables: { users: { ...init.tables.users, columns: { ...init.tables.users.columns, age } } },
	};
	const extra = tempDir('dk-old-snapshots-');
	writeSnapshot(extra, '20230204000000', child);
	flow.seed('main', join(fixtures, 'format-4'));
	flow.seed('main', extra);
	const users = (columns = {}) =>
		pgTable('users', {
			id: uuid().primaryKey().defaultRandom(),
			email: text().notNull(),
			name: text(),
			created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
			...columns,
		});

	expect(await flow.up('main')).toHaveLength(2);

	expectConverted(flow, [init, child], [
		schemaState({ users: users() }),
		schemaState({ users: users({ age: integer() }) }),
	]);
});

// The format 5 folder was written by hand: it names the type timestamptz and gives the serial primary
// key no NOT NULL.
const format5State = patchRows(
	schemaState({
		users: pgTable('users', {
			id: serial().primaryKey(),
			name: text().notNull(),
			verified: boolean().notNull().default(false),
			jsonb: jsonb(),
			created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
		}),
	}),
	(row) => {
		if (row.entityType !== 'columns') return row;
		if (row.name === 'id') return { ...row, notNull: false };
		if (row.name === 'created_at') return { ...row, type: 'timestamptz' };
		return row;
	},
);

test('up converts a format 5 journal folder to format 9', async () => {
	const flow = createFolderFlow();
	flow.seed('main', join(fixtures, 'format-5'));

	expect(await flow.up('main')).toHaveLength(2);

	expectConverted(flow, [
		readFixture('format-5', 'meta', '0000_snapshot.json'),
		readFixture('format-5', 'meta', '0001_snapshot.json'),
	], [format5State, format5State]);
});

test('up converts a format 6 journal folder to format 9', async () => {
	const flow = createFolderFlow();
	// drizzle-kit up wrote format 6 files with this step of the chain.
	const originals = ['0000_snapshot.json', '0001_snapshot.json'].map((file) =>
		updateUpToV6(readFixture('format-5', 'meta', file))
	);
	const dir = tempDir('dk-old-snapshots-');
	cpSync(join(fixtures, 'format-5'), dir, { recursive: true });
	writeFileSync(join(dir, 'meta', '0000_snapshot.json'), JSON.stringify(originals[0], null, 2));
	writeFileSync(join(dir, 'meta', '0001_snapshot.json'), JSON.stringify(originals[1], null, 2));
	flow.seed('main', dir);

	expect(await flow.up('main')).toHaveLength(2);

	expectConverted(flow, originals, [format5State, format5State]);
});

const status = pgEnum('status', ['draft', 'published']);
const format7Users = pgTable('users', { id: serial().primaryKey(), email: text().notNull(), age: integer() }, (t) => [
	uniqueIndex('users_email_idx').on(t.email),
]);
const format7Posts = pgTable('posts', {
	id: serial().primaryKey(),
	authorId: integer().notNull().references(() => format7Users.id, { onDelete: 'cascade' }),
	status: status().default('draft').notNull(),
	createdAt: timestamp().defaultNow(),
});
const renamedUsers = pgTable(
	'users',
	{ id: serial().primaryKey(), contact: text().notNull(), age: integer() },
	(t) => [
		uniqueIndex('users_email_idx').on(t.contact),
	],
);
const articles = pgTable('articles', {
	id: serial().primaryKey(),
	authorId: integer().notNull().references(() => renamedUsers.id, { onDelete: 'cascade' }),
	status: status().default('draft').notNull(),
	createdAt: timestamp().defaultNow(),
});
// drizzle-orm 0.44.1 ended a default foreign key name with _fk.
const oldNames = (row: Record<string, any>) =>
	row.entityType === 'fks' ? { ...row, name: row.name.replace(/_fkey$/, '_fk') } : row;
const format7States = () => [
	schemaState({ users: format7Users }),
	patchRows(schemaState({ status, users: format7Users, posts: format7Posts }), oldNames),
	patchRows(schemaState({ status, users: renamedUsers, articles }), oldNames),
];
const format7Files = ['0000_snapshot.json', '0001_snapshot.json', '0002_snapshot.json'];

test('up converts a format 7 journal folder to format 9', async () => {
	const flow = createFolderFlow();
	flow.seed('main', join(fixtures, 'format-7'));

	expect(await flow.up('main')).toHaveLength(3);

	expectConverted(flow, format7Files.map((file) => readFixture('format-7', 'meta', file)), format7States());
	expect(await flow.migrate('main', { status, users: renamedUsers, articles })).toStrictEqual([]);
});

test('up turns format 7 renames into rename deltas', async () => {
	const flow = createFolderFlow();
	const dir = tempDir('dk-old-snapshots-');
	cpSync(join(fixtures, 'format-7'), dir, { recursive: true });
	// The fixture has an empty `_meta`. Here it records the renames of the last migration, old name first.
	// A table in the default schema has no schema part in its key.
	const originals = format7Files.map((file) => readFixture('format-7', 'meta', file));
	originals[2]._meta = {
		schemas: {},
		tables: { '"posts"': '"articles"' },
		columns: { '"users"."email"': '"users"."contact"' },
	};
	writeFileSync(join(dir, 'meta', format7Files[2]), JSON.stringify(originals[2], null, 2));
	flow.seed('main', dir);

	expect(await flow.up('main')).toHaveLength(3);

	const last = flow.folders('main').at(-1)!;
	expect(flow.deltas('main', last).filter((it) => it.op === 'rename')).toStrictEqual(expect.arrayContaining([
		{ op: 'rename', key: 'tables\0["public","posts"]', set: { name: 'articles' } },
		{ op: 'rename', key: 'columns\0["public","users","email"]', set: { name: 'contact' } },
	]));
	expectConverted(flow, originals, format7States());
});
