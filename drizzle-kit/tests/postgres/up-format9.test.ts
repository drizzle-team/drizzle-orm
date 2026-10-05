import { randomUUID } from 'crypto';
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
import { cpSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CommandOutputCliError, errorToEnvelope } from 'src/cli/errors';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { fromEntities } from 'src/dialects/postgres/ddl';
import { type PostgresSnapshotV8, snapshotValidator, stateHash } from 'src/dialects/postgres/snapshot';
import { updateUpToV6 } from 'src/dialects/postgres/versions';
import { expect, test } from 'vitest';
import { ORIGIN, writeSnapshot } from '../other/check-fixtures';
import { createFolderFlow, type FolderFlow, schemaState, tempDir } from './folder-flow';

// drizzle-kit 1.0.0-rc.4 wrote the format 8 folders. Its check passed on the linear, renames and merge
// folders. It reported a conflict between the two leaves of the fork folder, which set NOT NULL and
// change the type of one column. This SQL runs in either order. drizzle-kit 0.31.7 with
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

test.each(['format-8-linear', 'format-8-renames', 'format-8-merge', 'format-8-fork'])(
	'up stores statements that rebuild the SQL of every migration of %s',
	async (name) => {
		const { flow } = seedFormat8(name);

		await flow.up('main');

		for (const folder of flow.folders('main')) {
			expect(flow.statementsSql('main', folder), `the statements of ${folder}`).toBe(flow.sql('main', folder));
		}
	},
);

test('up stores the hash of the state after each converted migration', async () => {
	const { flow, original } = seedFormat8('format-8-merge');

	await flow.up('main');

	for (const [folder, it] of original) {
		expect(flow.snapshot('main', folder).stateHash, `the hash of ${folder}`).toBe(stateHash(fromEntities(it.ddl)));
	}
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
		key: 'indexes\0["public","email"]',
	});
	expect(flow.deltas('main', '20260928150356_contact')).toContainEqual({
		op: 'create',
		row: expect.objectContaining({ entityType: 'indexes', name: 'contact_idx' }),
	});
	for (const folder of ['20260928150358_accounts', '20260928150359_core']) {
		expect(flow.deltas('main', folder).map((it) => it.op)).not.toContain('create');
		expect(flow.deltas('main', folder).map((it) => it.op)).not.toContain('drop');
	}
	// Each rename is followed by its instructions: nine for a table, and fourteen for a schema.
	expect(flow.deltas('main', '20260928150358_accounts').map((it) => it.op)).toStrictEqual([
		'rename',
		...Array(9).fill('update'),
	]);
	expect(flow.deltas('main', '20260928150358_accounts')).toContainEqual({
		op: 'update',
		type: 'columns',
		where: { schema: 'public', table: 'users' },
		set: { table: 'accounts' },
	});
	expect(flow.deltas('main', '20260928150359_core').map((it) => it.op)).toStrictEqual([
		'rename',
		...Array(14).fill('update'),
	]);
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

test('check passes after up converts a format 8 fork that changes two properties of one column', async () => {
	const { flow, original } = seedFormat8('format-8-fork');
	const merged = { users: pgTable('users', { email: integer().notNull() }) };

	await flow.up('main');

	expectOriginalStates(flow, original);
	expect(flow.leaves('main')).toStrictEqual(['20260928145239_not_null', '20260928145241_integer']);
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.generate('main', merged)).toMatchObject({ status: 'no_changes' });
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

test('up keeps the primary key name that Postgres gave when a format 8 file stores the default name of the renamed table', async () => {
	const { flow, original } = seedFormat8('format-8-renames');
	// Postgres keeps users_pkey when users is renamed to accounts. This file stores the default name of the new
	// table instead, as files do that were converted from drizzle-kit 0.x.
	const folder = '20260928150358_accounts';
	const edited = original.get(folder)!;
	for (const row of edited.ddl) if (row.entityType === 'pks') row.name = 'accounts_pkey';
	flow.overwriteSnapshot('main', folder, JSON.stringify(edited, null, 2));

	await flow.up('main');

	const keyNames = (it: string) => (it.includes('"pks"') ? it.replace('"accounts_pkey"', '"users_pkey"') : it);
	for (const [it, snapshot] of original) {
		expect(flow.state('main', it)).toStrictEqual(normalizeDDL(snapshot.ddl).map(keyNames));
	}
	expect(flow.state('main', folder).filter((it) => it.includes('"pks"')).map((it) => JSON.parse(it).name))
		.toStrictEqual(['users_pkey']);
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

const troubleshooting = 'https://orm.drizzle.team/docs/kit-migrations-troubleshooting';

test('up refuses a format 8 folder with a deleted middle migration and changes no file', async () => {
	const { flow, original } = seedFormat8('format-8-linear');
	const missing = original.get('20260928145209_posts')!.id;
	flow.deleteFolder('main', '20260928145209_posts');
	const before = flow.files('main');

	const error = await flow.up('main').catch((e: unknown) => e);

	expect((error as Error).message).toBe(
		'Cannot convert the migrations folder to snapshot format 9: a migration was deleted in the middle of the '
			+ `history. Migration 20260928145210_roles follows the snapshot ${missing}, and no migration in the folder has `
			+ 'this snapshot. No file was changed. Restore the missing migration from git. If that is not possible, delete '
			+ '20260928145210_roles and every later migration, run drizzle-kit up, and generate them again. '
			+ `See ${troubleshooting}`,
	);
	expect(errorToEnvelope(error)).toStrictEqual({
		status: 'error',
		error: {
			code: 'command_output_error',
			command: 'up',
			kind: 'history',
			snapshot: expect.stringContaining(join('20260928145210_roles', 'snapshot.json')),
			parentId: missing,
		},
	});
	expect(flow.files('main')).toStrictEqual(before);
});

test('up refuses a journal folder with a deleted middle migration before it moves any file', async () => {
	const flow = createFolderFlow();
	flow.seed('main', join(fixtures, 'format-7'));
	const journal = readFixture('format-7', 'meta', '_journal.json');
	journal.entries.splice(1, 1);
	flow.overwriteFile('main', join('meta', '_journal.json'), JSON.stringify(journal, null, 2));
	flow.deleteFolder('main', join('meta', '0001_snapshot.json'));
	flow.deleteFolder('main', '0001_posts.sql');
	const missing = readFixture('format-7', 'meta', '0001_snapshot.json').id;
	const before = flow.files('main');

	const error = await flow.up('main').catch((e: unknown) => e);

	expect((error as Error).message).toContain(
		`Migration 0002_renames follows the snapshot ${missing}, and no migration in the folder has this snapshot.`,
	);
	expect(errorToEnvelope(error)).toMatchObject({ error: { command: 'up', kind: 'history', parentId: missing } });
	expect(flow.files('main')).toStrictEqual(before);
});

test('up refuses a journal entry that has no SQL file and changes no file', async () => {
	const flow = createFolderFlow();
	flow.seed('main', join(fixtures, 'format-7'));
	flow.deleteFolder('main', '0001_posts.sql');
	const before = flow.files('main');

	const error = await flow.up('main').catch((e: unknown) => e);

	expect((error as Error).message).toMatch(
		/^Cannot convert the migrations folder to snapshot format 9: the journal entry 0001_posts has no SQL file\. drizzle-kit expects it at \S+0001_posts\.sql\. No file was changed\. Restore this file from git, then run drizzle-kit up again\. See /,
	);
	expect(errorToEnvelope(error)).toStrictEqual({
		status: 'error',
		error: {
			code: 'command_output_error',
			command: 'up',
			kind: 'history',
			entry: '0001_posts',
			sql: expect.stringMatching(/0001_posts\.sql$/),
		},
	});
	expect(flow.files('main')).toStrictEqual(before);
});

test('up refuses a format 8 folder that sorts before its parent, with the error kind order', async () => {
	const { flow } = seedFormat8('format-8-linear');
	flow.renameFolder('main', '20260928145209_posts', '20260928145200_posts');
	const before = flow.files('main');

	const error = await flow.up('main').catch((e: unknown) => e);

	expect((error as Error).message).toBe(
		'Migration 20260928145200_posts sorts before its parent 20260928145207_init, so migrate can run it first. '
			+ 'Rename the folders so that 20260928145200_posts sorts after 20260928145207_init.',
	);
	expect(errorToEnvelope(error)).toStrictEqual({
		status: 'error',
		error: {
			code: 'check_error',
			kind: 'order',
			snapshot: expect.stringContaining(join('20260928145200_posts', 'snapshot.json')),
			parentSnapshot: expect.stringContaining(join('20260928145207_init', 'snapshot.json')),
		},
	});
	expect(flow.files('main')).toStrictEqual(before);
});

// drizzle-kit 1.0.0-rc.4 could merge two branches with --ignore-conflicts. Here branch a renames the schema
// `old` to `archive`, and branch b adds a schema `archive`. The merge starts from b, its newest leaf, and
// the rename of branch a then moves `old` onto the name that b took.
test('up refuses an old merge whose branches gave one name to two entities, and changes no file', async () => {
	const dir = tempDir('dk-format-8-collision-');
	const rowsOf = (...schemas: string[]) => schemas.map((name) => ({ entityType: 'schemas', name }));
	const files = [
		{ folder: '20260101120001_main', id: 'main', prevIds: [ORIGIN], ddl: rowsOf('old') },
		{ folder: '20260101120002_a', id: 'a', prevIds: ['main'], ddl: rowsOf('archive'), renames: ['old->archive'] },
		{ folder: '20260101120003_b', id: 'b', prevIds: ['main'], ddl: rowsOf('old', 'archive') },
		{ folder: '20260101120004_merge', id: 'merge', prevIds: ['a', 'b'], ddl: rowsOf('archive', 'extra') },
	];
	for (const { folder, renames = [], ...it } of files) {
		writeSnapshot(dir, folder, { version: '8', dialect: 'postgres', ...it, renames });
	}
	const flow = createFolderFlow();
	flow.seed('main', dir);
	const before = flow.files('main');

	const error = await flow.up('main').catch((e: unknown) => e);

	expect((error as Error).message).toBe(
		'Cannot convert the migrations folder to snapshot format 9: the merge in migration 20260101120004_merge cannot '
			+ 'be rebuilt. The rename delta moves schemas ["old"] to ["archive"], and another row of schemas already has '
			+ 'the key ["archive"]. Two migrations gave one name to two different entities. No file was changed. '
			+ `Snapshot format 9 does not support a merge of such branches. See ${troubleshooting}`,
	);
	expect(errorToEnvelope(error)).toStrictEqual({
		status: 'error',
		error: {
			code: 'command_output_error',
			command: 'up',
			kind: 'history',
			snapshot: expect.stringContaining(join('20260101120004_merge', 'snapshot.json')),
		},
	});
	expect(flow.files('main')).toStrictEqual(before);
});

test('up returns ok for a format 9 folder with a broken history, and check reports it', async () => {
	const { flow } = seedFormat8('format-8-linear');
	await flow.up('main');
	flow.deleteFolder('main', '20260928145209_posts');
	const before = flow.files('main');

	expect(await flow.up('main')).toStrictEqual([]);

	expect(flow.files('main')).toStrictEqual(before);
	await expect(flow.check('main')).rejects.toThrow('is missing from the migrations folder');
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

// The fixture has an empty `_meta`. This copy records the renames of the last migration, old name first.
// A table in the default schema has no schema part in its key.
const format7WithRenames = () => {
	const dir = tempDir('dk-old-snapshots-');
	cpSync(join(fixtures, 'format-7'), dir, { recursive: true });
	const originals = format7Files.map((file) => readFixture('format-7', 'meta', file));
	originals[2]._meta = {
		schemas: {},
		tables: { '"posts"': '"articles"' },
		columns: { '"users"."email"': '"users"."contact"' },
	};
	writeFileSync(join(dir, 'meta', format7Files[2]), JSON.stringify(originals[2], null, 2));
	return { dir, originals };
};

// Postgres keeps the name posts_pkey when the table is renamed, and drizzle-kit 0.31.7 wrote no SQL for the key.
const withPostgresKeyName = (row: Record<string, any>) =>
	row.entityType === 'pks' && row.table === 'articles' ? { ...row, name: 'posts_pkey' } : row;

test('up turns format 7 renames into rename deltas', async () => {
	const flow = createFolderFlow();
	const { dir, originals } = format7WithRenames();
	flow.seed('main', dir);

	expect(await flow.up('main')).toHaveLength(3);

	const last = flow.folders('main').at(-1)!;
	expect(flow.deltas('main', last).filter((it) => it.op === 'rename')).toStrictEqual(expect.arrayContaining([
		{ op: 'rename', key: 'tables\0["public","posts"]', set: { name: 'articles' } },
		{ op: 'rename', key: 'columns\0["public","users","email"]', set: { name: 'contact' } },
	]));
	expect(flow.statements('main', last)).toStrictEqual(expect.arrayContaining([
		{ type: 'rename_table', schema: 'public', from: 'posts', to: 'articles' },
		expect.objectContaining({ type: 'rename_column', to: expect.objectContaining({ name: 'contact' }) }),
	]));
	const [first, second, third] = format7States();
	expectConverted(flow, originals, [first, second, patchRows(third, withPostgresKeyName)]);
});

test('after up, a migration that drops the primary key of a table that 0.x renamed runs', async () => {
	const flow = createFolderFlow();
	flow.seed('main', format7WithRenames().dir);
	await flow.up('main');
	const withoutKey = {
		status,
		users: renamedUsers,
		articles: pgTable('articles', {
			id: serial(),
			authorId: integer().notNull().references(() => renamedUsers.id, { onDelete: 'cascade' }),
			status: status().default('draft').notNull(),
			createdAt: timestamp().defaultNow(),
		}),
	};

	const { folder } = await flow.generate('main', withoutKey);

	expect(flow.sql('main', folder!)).toBe('ALTER TABLE "articles" DROP CONSTRAINT "posts_pkey";');
	expect(await flow.migrate('main', withoutKey)).toStrictEqual([]);
});

// A format 7 folder with the first two migrations of the fixture and a third one, as drizzle-kit 0.31.7
// writes it on a git branch.
const format7Branch = (
	tag: string,
	when: number,
	tables: Record<string, string>,
	change: (snapshot: Record<string, any>) => void,
	sql: string[],
) => {
	const dir = tempDir('dk-format-7-branch-');
	cpSync(join(fixtures, 'format-7'), dir, { recursive: true });
	rmSync(join(dir, '0002_renames.sql'));
	const parent = readFixture('format-7', 'meta', '0001_snapshot.json');
	const snapshot = { ...structuredClone(parent), id: randomUUID(), prevId: parent.id };
	snapshot._meta = { schemas: {}, columns: {}, tables };
	change(snapshot);
	writeFileSync(join(dir, 'meta', '0002_snapshot.json'), JSON.stringify(snapshot, null, 2));
	writeFileSync(join(dir, `${tag}.sql`), sql.join('--> statement-breakpoint\n'));
	const journal = readFixture('format-7', 'meta', '_journal.json');
	journal.entries[2] = { ...journal.entries[2], when, tag };
	writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify(journal, null, 2));
	return dir;
};

const authorKey = (name: string, tableFrom: string, tableTo: string) => ({
	[name]: {
		name,
		tableFrom,
		tableTo,
		columnsFrom: ['authorId'],
		columnsTo: ['id'],
		onDelete: 'cascade',
		onUpdate: 'no action',
	},
});

// After a table rename, drizzle-kit 0.31.7 dropped a foreign key and added it again under a name with the new
// table name. Both branches do that for the foreign key from posts to users.
test('check reports the conflict between two 0.x branches that rename the two ends of a foreign key', async () => {
	const articles = format7Branch(
		'0002_articles',
		Date.UTC(2026, 8, 28, 15, 34, 33),
		{ '"posts"': '"articles"' },
		(s) => {
			const posts = s.tables['public.posts'];
			delete s.tables['public.posts'];
			s.tables['public.articles'] = {
				...posts,
				name: 'articles',
				foreignKeys: authorKey('articles_authorId_users_id_fk', 'articles', 'users'),
			};
		},
		[
			'ALTER TABLE "posts" RENAME TO "articles";',
			'ALTER TABLE "articles" DROP CONSTRAINT "posts_authorId_users_id_fk";',
			'ALTER TABLE "articles" ADD CONSTRAINT "articles_authorId_users_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;',
		],
	);
	const people = format7Branch('0002_people', Date.UTC(2026, 8, 28, 15, 35, 0), { '"users"': '"people"' }, (s) => {
		const users = s.tables['public.users'];
		delete s.tables['public.users'];
		s.tables['public.people'] = { ...users, name: 'people' };
		s.tables['public.posts'].foreignKeys = authorKey('posts_authorId_people_id_fk', 'posts', 'people');
	}, [
		'ALTER TABLE "users" RENAME TO "people";',
		'ALTER TABLE "posts" DROP CONSTRAINT "posts_authorId_users_id_fk";',
		'ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_people_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;',
	]);
	const flow = createFolderFlow();
	flow.branch('a');
	flow.branch('b');
	flow.seed('a', articles);
	flow.seed('b', people);
	await flow.up('a');
	await flow.up('b');
	flow.merge('a', 'b');

	// The SQL of the people branch drops a foreign key on the posts table, which the articles branch renamed.
	await expect(flow.migrate('a', {})).rejects.toMatchObject({
		cause: expect.objectContaining({ message: 'relation "posts" does not exist' }),
	});
	expect(await flow.check('a')).toMatchObject({
		status: 'conflicts',
		folders: ['20260928153433_articles', '20260928153500_people'],
	});
});
