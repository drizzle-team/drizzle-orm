// Verifies the main flows of snapshot format 9 through the real `generate`, `check`, `up` and `pull` commands.
// A linear history writes a base snapshot and then diff snapshots, and each snapshot stores the deltas and the
// statements of its migration. `check` reads only the stored statements. Branches that commute merge into one
// leaf, and branches that conflict stop `check` and `generate`. A hand-edited snapshot that does not
// reconstruct stops `generate` with an error that names the migration folder. `migrate` and `pull` use PGlite.
import { PGlite } from '@electric-sql/pglite';
import { index, integer, pgTable, primaryKey, text, unique, varchar } from 'drizzle-orm/pg-core';
import { errorToEnvelope } from 'src/cli/errors';
import { expect, onTestFinished, test } from 'vitest';
import { ORIGIN } from '../other/check-fixtures';
import {
	columnRow,
	createFolderFlow,
	createFormat8Flow,
	forkFlow,
	malformedEnvelope,
	reconstructFix,
	rename,
	schemaState,
	step,
} from './folder-flow';

test('generate stores the statements of each migration, and a custom migration stores none', async () => {
	const flow = createFolderFlow();
	const v1 = { users: pgTable('users', { id: integer() }) };
	const v2 = {
		users: pgTable('users', { id: integer().notNull(), email: varchar() }, (t) => [
			index('users_email_idx').on(t.email),
		]),
	};

	const first = await flow.generate('main', v1);
	const second = await flow.generate('main', v2);
	const custom = await flow.generate('main', v2, { custom: true });

	expect(flow.statements('main', first.folder)).toMatchObject([
		{ type: 'create_table', table: { schema: 'public', name: 'users', columns: [{ name: 'id' }] } },
	]);
	expect(flow.statements('main', second.folder)).toMatchObject([
		{ type: 'add_column', column: { table: 'users', name: 'email' } },
		{ type: 'alter_column', to: { table: 'users', name: 'id', notNull: true } },
		{ type: 'create_index', index: { table: 'users', name: 'users_email_idx' } },
	]);
	expect(flow.statements('main', custom.folder)).toStrictEqual([]);
	// `statementsSql` rebuilds the SQL from the stored statements. It must equal migration.sql, so the statements
	// keep the order of the SQL and lose nothing.
	expect(flow.statementsSql('main', first.folder)).toBe(flow.sql('main', first.folder));
	expect(flow.statementsSql('main', second.folder)).toBe(flow.sql('main', second.folder));
});

test('check takes its conflicts from the stored statements of the snapshots', async () => {
	const { flow, folders } = await forkFlow({
		base: { users: pgTable('users', { id: integer() }) },
		branches: [
			[step({ users: pgTable('users', { id: integer(), email: varchar() }) })],
			[step({ users: pgTable('users', { id: integer(), email: text() }) })],
		],
	});
	const folder = folders[1][0];
	expect(await flow.check('main')).toMatchObject({ status: 'conflicts' });

	// After this edit, the deltas of both branches still add the same column. `check` passes because it reads
	// only the stored `statements`.
	flow.overwriteSnapshot('main', folder, JSON.stringify({ ...flow.snapshot('main', folder), statements: [] }));

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
});

// The edit sets the type of users.id to bigint in the base snapshot. No check compares a reconstructed state
// with the state at the time of writing, so `generate` treats the edited state as the state of the database.
test('after a hand edit of a base snapshot, check passes and generate writes SQL for the difference', async () => {
	const flow = createFolderFlow();
	const v1 = { users: pgTable('users', { id: integer(), email: varchar() }) };
	const { folder: first } = await flow.generate('main', v1);
	const base = flow.snapshot('main', first);
	if (base.type !== 'base') throw new Error('The first migration must have a base snapshot.');
	const rows = base.ddl.map((
		row,
	) => (row.entityType === 'columns' && row.name === 'id' ? { ...row, type: 'bigint' } : row));
	flow.overwriteSnapshot('main', first, JSON.stringify({ ...base, ddl: rows }, null, 2));

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	const { folder } = await flow.generate('main', v1);

	expect(flow.sql('main', folder)).toBe(
		'ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE integer USING "id"::integer;',
	);
	expect(flow.state('main', folder)).toStrictEqual(schemaState(v1));
});

// Makes a leaf that does not reconstruct. The rename delta moves the table users onto the key of a table that
// the state already holds, so it gives a key collision.
const renameUsersTo = (name: string) => ({ op: 'rename', key: 'tables\0["public","users"]', set: { name } }) as const;

test('a leaf that does not reconstruct passes check and stops generate, and the error names the migration folder', async () => {
	const flow = createFolderFlow();
	const accounts = pgTable('accounts', { id: integer() });
	const v1 = { users: pgTable('users', { id: integer() }), accounts };
	const v2 = { users: pgTable('users', { id: integer(), email: varchar() }), accounts };
	await flow.generate('main', v1);
	const { folder } = await flow.generate('main', v2);
	flow.appendDeltas('main', folder, renameUsersTo('accounts'));
	const before = flow.files('main');

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	for (const custom of [false, true]) {
		const error = await flow.generate('main', v2, { custom }).catch((e) => e);
		expect(error.message).toContain(`Cannot reconstruct the state of migration ${folder}: `);
		expect(error.message).toContain('tables ["public","users"]');
		expect(error.message).toContain(reconstructFix(folder));
		expect(errorToEnvelope(error)).toStrictEqual(malformedEnvelope(folder));
	}
	expect(flow.files('main')).toStrictEqual(before);
});

test('generate stores one drop delta for a dropped table and for each of its columns, constraints and indexes', async () => {
	const flow = createFolderFlow();
	const users = pgTable('users', { id: integer().notNull(), email: varchar() }, (t) => [
		primaryKey({ name: 'users_pk', columns: [t.id] }),
		unique('users_email_unique').on(t.email),
		index('users_email_idx').on(t.email),
	]);
	const posts = pgTable('posts', { id: integer() });
	await flow.generate('main', { users, posts });

	const { folder } = await flow.generate('main', { posts });

	expect(flow.sql('main', folder)).toBe('DROP TABLE "users";');
	expect(flow.deltas('main', folder).map((it) => (it.op === 'drop' ? it.key : it)).sort()).toStrictEqual([
		'columns\0["public","users","email"]',
		'columns\0["public","users","id"]',
		'indexes\0["public","users_email_idx"]',
		'pks\0["public","users","users_pk"]',
		'tables\0["public","users"]',
		'uniques\0["public","users","users_email_unique"]',
	]);
	expect(flow.state('main', folder)).toStrictEqual(schemaState({ posts }));
});

// The drop delta of the column `name` removes only that column, because a drop follows no edge. The index
// `users_contact_idx` stays in the state, and its own delta gives it the column list without `name`.
test('after a column drop, an index of that column stays in the state with its other columns', async () => {
	const flow = createFolderFlow();
	const v1 = {
		users: pgTable('users', { id: integer(), email: varchar(), name: varchar() }, (t) => [
			index('users_contact_idx').on(t.email, t.name),
		]),
	};
	const v2 = {
		users: pgTable('users', { id: integer(), email: varchar() }, (t) => [index('users_contact_idx').on(t.email)]),
	};
	await flow.generate('main', v1);

	const { folder } = await flow.generate('main', v2);

	expect(flow.state('main', folder)).toStrictEqual(schemaState(v2));
	expect(await flow.tryGenerate('main', v2)).toMatchObject({ status: 'no_changes' });
	expect(await flow.migrate('main', v2)).toStrictEqual([]);
});

test('generate names the leaf that does not reconstruct when it is not the first parent', async () => {
	const users = pgTable('users', { id: integer() });
	const likes = pgTable('likes', { id: integer() });
	const groups = pgTable('groups', { id: integer() });
	const { flow, folders: [[older], [newer]] } = await forkFlow({
		base: { users },
		branches: [[step({ users, likes })], [step({ users, groups })]],
	});
	flow.appendDeltas('main', older, renameUsersTo('likes'));
	expect(flow.leaves('main')).toStrictEqual([older, newer]);
	const before = flow.files('main');

	const error = await flow.generate('main', { users, likes, groups, posts: pgTable('posts', { id: integer() }) })
		.catch((e) => e);

	expect(error.message).toContain(`Cannot reconstruct the state of migration ${older}: `);
	expect(error.message).toContain(reconstructFix(older));
	expect(errorToEnvelope(error)).toStrictEqual(malformedEnvelope(older));
	expect(flow.files('main')).toStrictEqual(before);
});

test('generate --fix-conflicts does not reconstruct a leaf that the fix deletes', async () => {
	const tags = pgTable('tags', { id: integer() });
	const { flow, folders: [[a], [b]] } = await forkFlow({
		base: { users: pgTable('users', { score: integer() }) },
		branches: [
			[step({ users: pgTable('users', { score: integer().default(1) }), tags })],
			[step({ users: pgTable('users', { score: integer().default(2) }) })],
		],
	});
	flow.appendDeltas('main', a, renameUsersTo('tags'));
	const resolved = { users: pgTable('users', { score: integer().default(3) }), tags };

	const { folder, deleted } = await flow.generate('main', resolved, { fixConflicts: true });

	expect(deleted).toStrictEqual([a, b]);
	expect(flow.state('main', folder)).toStrictEqual(schemaState(resolved));
});

test('a custom migration on two leaves lists both leaves as parents and stores no deltas and no statements', async () => {
	const users = pgTable('users', { id: integer() });
	const likes = pgTable('likes', { id: integer() });
	const groups = pgTable('groups', { id: integer() });
	const { flow, folders: [[older], [newer]] } = await forkFlow({
		base: { users },
		branches: [[step({ users, likes })], [step({ users, groups })]],
	});

	const { folder } = await flow.generate('main', { users, likes, groups }, { custom: true });

	expect(flow.snapshot('main', folder)).toMatchObject({
		type: 'diff',
		prevIds: [newer, older].map((it) => flow.snapshot('main', it).id),
		deltas: [],
		statements: [],
	});
	expect(flow.leaves('main')).toStrictEqual([folder]);
	expect(flow.state('main', folder)).toStrictEqual(schemaState({ users, likes, groups }));
});

test('linear history writes a base snapshot and then diff snapshots', async () => {
	const flow = createFolderFlow();
	const v1 = { users: pgTable('users', { id: integer(), email: varchar() }) };
	const v2 = {
		users: pgTable('users', { id: integer().notNull(), email: varchar(), name: text() }, (t) => [
			index('users_email_idx').on(t.email),
		]),
		posts: pgTable('posts', { id: integer() }),
	};
	const v3 = {
		users: pgTable('users', { id: integer().notNull(), contact: varchar(), name: text() }, (t) => [
			index('users_email_idx').on(t.contact),
		]),
		posts: pgTable('posts', { id: integer() }),
	};
	const v4 = {
		accounts: pgTable('accounts', { id: integer().notNull(), contact: varchar(), name: text() }, (t) => [
			index('users_email_idx').on(t.contact),
		]),
		posts: pgTable('posts', { id: integer() }),
	};

	const steps = [
		{ schema: v1, folder: (await flow.generate('main', v1)).folder },
		{ schema: v2, folder: (await flow.generate('main', v2)).folder },
		{
			schema: v3,
			folder: (await flow.generate('main', v3, {
				hints: [rename('column', 'public.users.email', 'public.users.contact')],
			})).folder,
		},
		{
			schema: v4,
			folder: (await flow.generate('main', v4, {
				hints: [rename('table', 'public.users', 'public.accounts')],
			})).folder,
		},
		{ schema: v4, folder: (await flow.generate('main', v4, { custom: true })).folder },
	];
	const unchanged = await flow.tryGenerate('main', v4);

	expect(unchanged.status).toBe('no_changes');
	expect(flow.folders('main')).toStrictEqual([
		'20260101120001_main',
		'20260101120002_main',
		'20260101120003_main',
		'20260101120004_main',
		'20260101120005_main',
	]);
	expect(flow.sql('main', '20260101120004_main')).toBe('ALTER TABLE "users" RENAME TO "accounts";');

	const snapshots = flow.folders('main').map((folder) => flow.snapshot('main', folder));
	expect(snapshots.map((it) => it.type)).toStrictEqual(['base', 'diff', 'diff', 'diff', 'diff']);
	expect(snapshots[0].prevIds).toStrictEqual([ORIGIN]);
	for (let idx = 1; idx < snapshots.length; idx++) {
		expect(snapshots[idx].prevIds).toStrictEqual([snapshots[idx - 1].id]);
	}
	for (const it of snapshots) {
		expect(it).not.toHaveProperty('renames');
	}
	expect(snapshots[4]).toMatchObject({ type: 'diff', deltas: [] });

	for (const { schema, folder } of steps) {
		expect(flow.state('main', folder)).toStrictEqual(schemaState(schema));
	}
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', v4)).toStrictEqual([]);
});

test('commuting fork merges into one leaf that holds only the new change', async () => {
	const users = pgTable('users', { id: integer() });
	const likes = pgTable('likes', { id: integer() });
	const groups = pgTable('groups', { id: integer() });
	const { flow } = await forkFlow({
		base: { users },
		branches: [[step({ users, likes })], [step({ users, groups })]],
	});

	expect(flow.leaves('main')).toStrictEqual(['20260101120002_a', '20260101120003_b']);
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });

	const merged = { users: pgTable('users', { id: integer(), email: varchar() }), likes, groups };
	const result = await flow.generate('main', merged);

	expect(result.folder).toBe('20260101120004_main');
	expect(flow.sql('main', '20260101120004_main')).toBe('ALTER TABLE "users" ADD COLUMN "email" varchar;');
	expect(flow.snapshot('main', '20260101120004_main')).toMatchObject({
		type: 'diff',
		prevIds: [flow.snapshot('main', '20260101120003_b').id, flow.snapshot('main', '20260101120002_a').id],
		deltas: [{ op: 'create', row: columnRow('users', 'email', 'varchar') }],
	});
	expect(flow.leaves('main')).toStrictEqual(['20260101120004_main']);
	expect(flow.state('main', '20260101120002_a')).toStrictEqual(schemaState({ users, likes }));
	expect(flow.state('main', '20260101120003_b')).toStrictEqual(schemaState({ users, groups }));
	expect(flow.state('main', '20260101120004_main')).toStrictEqual(schemaState(merged));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

test('conflicting fork fails check and generate', async () => {
	const { flow } = await forkFlow({
		base: { users: pgTable('users', { email: varchar() }) },
		branches: [
			[step({ users: pgTable('users', { email: text() }) })],
			[step({ users: pgTable('users', { email: integer() }) })],
		],
	});

	const result = await flow.check('main');

	expect(result).toMatchObject({ status: 'conflicts', folders: ['20260101120002_a', '20260101120003_b'] });
	await expect(flow.generate('main', { users: pgTable('users', { email: integer().notNull() }) })).rejects.toThrow(
		'Conflicting migrations detected',
	);
	expect(flow.folders('main')).toHaveLength(3);

	flow.deleteFolder('main', '20260101120003_b');
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
});

test('commands ask to run up on format 8 snapshots, and up converts them', async () => {
	const flow = createFormat8Flow([{ folder: '20250101000000_init', id: 'p1', prevIds: [ORIGIN] }]);
	const v1 = { users: pgTable('users', { id: integer() }) };

	await expect(flow.check('main')).rejects.toThrow('please run "drizzle-kit up"');
	await expect(flow.generate('main', v1)).rejects.toThrow('please run "drizzle-kit up"');
	expect(flow.folders('main')).toStrictEqual(['20250101000000_init']);

	expect(await flow.up('main')).toHaveLength(1);

	expect(flow.snapshot('main', '20250101000000_init')).toStrictEqual({
		type: 'base',
		version: '9',
		dialect: 'postgres',
		id: 'p1',
		prevIds: [ORIGIN],
		ddl: [],
		statements: [],
	});
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	const { folder } = await flow.generate('main', v1);
	expect(flow.snapshot('main', folder)).toMatchObject({ type: 'diff', prevIds: ['p1'] });
	expect(flow.state('main', folder)).toStrictEqual(schemaState(v1));
});

test('pull into an empty folder writes a base snapshot that generate continues', async () => {
	const flow = createFolderFlow();
	const client = new PGlite();
	onTestFinished(() => client.close());
	await client.exec('CREATE TABLE "users" ("id" integer);');
	const v1 = { users: pgTable('users', { id: integer() }) };
	const v2 = { users: pgTable('users', { id: integer(), email: varchar() }) };

	await flow.pull('main', client);
	const [pulled] = flow.folders('main');
	const base = flow.snapshot('main', pulled);
	expect(base).toMatchObject({ type: 'base', version: '9', dialect: 'postgres', prevIds: [ORIGIN] });
	expect(base.statements).toMatchObject([{ type: 'create_table', table: { schema: 'public', name: 'users' } }]);
	expect(flow.state('main', pulled)).toStrictEqual(schemaState(v1));

	const { folder } = await flow.generate('main', v2);

	expect(flow.folders('main')).toStrictEqual([pulled, folder]);
	expect(flow.snapshot('main', folder)).toStrictEqual({
		type: 'diff',
		version: '9',
		dialect: 'postgres',
		id: flow.snapshot('main', folder).id,
		prevIds: [base.id],
		statements: [expect.objectContaining({ type: 'add_column' })],
		deltas: [expect.objectContaining({ op: 'create', row: expect.objectContaining({ name: 'email' }) })],
	});
	expect(flow.state('main', folder)).toStrictEqual(schemaState(v2));
});
