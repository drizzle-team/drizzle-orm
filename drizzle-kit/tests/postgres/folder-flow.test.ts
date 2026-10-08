import { PGlite } from '@electric-sql/pglite';
import { index, integer, pgPolicy, pgRole, pgTable, primaryKey, text, unique, varchar } from 'drizzle-orm/pg-core';
import { join } from 'path';
import { errorToEnvelope } from 'src/cli/errors';
import type { Delta } from 'src/dialects/dialect';
import { expect, onTestFinished, test } from 'vitest';
import { ORIGIN, writeSnapshot } from '../other/check-fixtures';
import { columnRow, createFolderFlow, malformedEnvelope, reconstructFix, schemaState, tempDir } from './folder-flow';

test('linear history with a column rename', async () => {
	const flow = createFolderFlow();
	const v1 = { users: pgTable('users', { id: integer() }) };
	const v2 = { users: pgTable('users', { id: integer(), email: varchar() }) };
	const v3 = { users: pgTable('users', { id: integer(), contact: varchar() }) };

	await flow.generate('main', v1);
	await flow.generate('main', v2);
	await flow.generate('main', v3, {
		hints: [{ type: 'rename', kind: 'column', from: ['public', 'users', 'email'], to: ['public', 'users', 'contact'] }],
	});
	const unchanged = await flow.generate('main', v3);

	expect(unchanged.status).toBe('no_changes');
	expect(flow.folders('main')).toStrictEqual([
		'20260101120001_main',
		'20260101120002_main',
		'20260101120003_main',
	]);
	expect(flow.sql('main', '20260101120001_main')).toBe('CREATE TABLE "users" (\n\t"id" integer\n);\n');
	expect(flow.sql('main', '20260101120002_main')).toBe('ALTER TABLE "users" ADD COLUMN "email" varchar;');
	expect(flow.sql('main', '20260101120003_main')).toBe('ALTER TABLE "users" RENAME COLUMN "email" TO "contact";');

	const first = flow.snapshot('main', '20260101120001_main');
	const second = flow.snapshot('main', '20260101120002_main');
	const third = flow.snapshot('main', '20260101120003_main');
	expect(second.prevIds).toStrictEqual([first.id]);
	expect(third).toStrictEqual({
		type: 'diff',
		version: '9',
		dialect: 'postgres',
		id: third.id,
		prevIds: [second.id],
		statements: [expect.objectContaining({ type: 'rename_column' })],
		deltas: [{ op: 'rename', key: 'columns\0["public","users","email"]', set: { name: 'contact' } }],
	});

	expect(flow.leaves('main')).toStrictEqual(['20260101120003_main']);
	expect(flow.state('main', '20260101120003_main')).toStrictEqual(schemaState(v3));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', v3)).toStrictEqual([]);
});

test('a role rename writes only the rename, and its snapshot stores one rename delta', async () => {
	const flow = createFolderFlow();
	const schema = (role: ReturnType<typeof pgRole>) => ({
		role,
		users: pgTable('users', { id: integer() }, () => [pgPolicy('users_read', { for: 'select', to: role })]),
	});
	await flow.generate('main', schema(pgRole('staff')));

	const { folder } = await flow.generate('main', schema(pgRole('team')), {
		hints: [{ type: 'rename', kind: 'role', from: ['staff'], to: ['team'] }],
	});

	expect(flow.sql('main', folder!)).toBe('ALTER ROLE "staff" RENAME TO "team";');
	expect(flow.deltas('main', folder!)).toStrictEqual([
		{ op: 'rename', key: 'roles\0["staff"]', set: { name: 'team' } },
	]);
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(schema(pgRole('team'))));
	expect(await flow.migrate('main', schema(pgRole('team')))).toStrictEqual([]);
});

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

	expect(flow.statements('main', first.folder!)).toMatchObject([
		{ type: 'create_table', table: { schema: 'public', name: 'users', columns: [{ name: 'id' }] } },
	]);
	expect(flow.statements('main', second.folder!)).toMatchObject([
		{ type: 'add_column', column: { table: 'users', name: 'email' } },
		{ type: 'alter_column', to: { table: 'users', name: 'id', notNull: true } },
		{ type: 'create_index', index: { table: 'users', name: 'users_email_idx' } },
	]);
	expect(flow.statements('main', custom.folder!)).toStrictEqual([]);
	// The statements are in the order of the SQL, and they hold everything that the SQL has.
	expect(flow.statementsSql('main', first.folder!)).toBe(flow.sql('main', first.folder!));
	expect(flow.statementsSql('main', second.folder!)).toBe(flow.sql('main', second.folder!));
});

test('check takes its conflicts from the stored statements of the snapshots', async () => {
	const flow = createFolderFlow();
	const users = pgTable('users', { id: integer() });
	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: pgTable('users', { id: integer(), email: varchar() }) });
	const { folder } = await flow.generate('b', { users: pgTable('users', { id: integer(), email: text() }) });
	flow.merge('main', 'a', 'b');
	expect(await flow.check('main')).toMatchObject({ status: 'conflicts' });

	// The deltas of both branches still add the same column. Check does not rebuild statements from them.
	flow.overwriteSnapshot('main', folder!, JSON.stringify({ ...flow.snapshot('main', folder!), statements: [] }));

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
});

test('no snapshot that generate or up writes has a stateHash field', async () => {
	const flow = createFolderFlow();
	const users = pgTable('users', { id: integer() });
	const likes = pgTable('likes', { id: integer() });
	const groups = pgTable('groups', { id: integer() });
	const merged = { users: pgTable('users', { id: integer(), email: varchar() }), likes, groups };
	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users, likes });
	await flow.generate('b', { users, groups });
	flow.merge('main', 'a', 'b');
	await flow.generate('main', merged);
	await flow.generate('main', merged, { custom: true });
	const converted = createFolderFlow();
	converted.seed('main', join(__dirname, 'old-snapshots', 'format-8-merge'));
	await converted.up('main');

	const written = flow.folders('main').map((it) => flow.snapshot('main', it));
	expect(written.map((it) => [it.type, it.prevIds.length])).toStrictEqual([
		['base', 1],
		['diff', 1],
		['diff', 1],
		['diff', 2],
		['diff', 1],
	]);
	for (const it of [...written, ...converted.folders('main').map((folder) => converted.snapshot('main', folder))]) {
		expect(it).not.toHaveProperty('stateHash');
	}
});

// The validator ignores a field that it does not know.
test('a snapshot that holds a stateHash field with any value passes check, and generate continues from it', async () => {
	const flow = createFolderFlow();
	const v1 = { users: pgTable('users', { id: integer() }) };
	const v2 = { users: pgTable('users', { id: integer(), email: varchar() }) };
	const v3 = { users: pgTable('users', { id: integer(), email: varchar(), age: integer() }) };
	const first = await flow.generate('main', v1);
	const second = await flow.generate('main', v2);
	for (const [folder, stateHash] of [[first.folder!, 'not-a-hash'], [second.folder!, 42]] as const) {
		flow.overwriteSnapshot('main', folder, JSON.stringify({ ...flow.snapshot('main', folder), stateHash }));
	}

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	const { folder } = await flow.generate('main', v3);

	expect(flow.sql('main', folder!)).toBe('ALTER TABLE "users" ADD COLUMN "age" integer;');
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(v3));
});

// Nothing compares a reconstructed state with the state at the time of writing. So generate takes the edited
// state as the state of the database and writes SQL for the difference.
test('after a hand edit of a base snapshot, check passes and generate writes SQL for the difference', async () => {
	const flow = createFolderFlow();
	const v1 = { users: pgTable('users', { id: integer(), email: varchar() }) };
	const { folder: first } = await flow.generate('main', v1);
	const base = flow.snapshot('main', first!);
	if (base.type !== 'base') throw new Error('The first migration must have a base snapshot.');
	const rows = base.ddl.map((
		row,
	) => (row.entityType === 'columns' && row.name === 'id' ? { ...row, type: 'bigint' } : row));
	flow.overwriteSnapshot('main', first!, JSON.stringify({ ...base, ddl: rows }, null, 2));

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	const { folder } = await flow.generate('main', v1);

	expect(flow.sql('main', folder!)).toBe(
		'ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE integer USING "id"::integer;',
	);
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(v1));
});

// A rename delta that moves the table users onto the key of another table. Reconstruct throws for it.
const renameUsersTo = (name: string) => ({ op: 'rename', key: 'tables\0["public","users"]', set: { name } }) as const;

test('a leaf that does not reconstruct passes check and stops generate, and the error names the migration folder', async () => {
	const flow = createFolderFlow();
	const accounts = pgTable('accounts', { id: integer() });
	const v1 = { users: pgTable('users', { id: integer() }), accounts };
	const v2 = { users: pgTable('users', { id: integer(), email: varchar() }), accounts };
	await flow.generate('main', v1);
	const { folder } = await flow.generate('main', v2);
	flow.appendDeltas('main', folder!, renameUsersTo('accounts'));
	const before = flow.files('main');

	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	for (const custom of [false, true]) {
		const error = await flow.generate('main', v2, { custom }).catch((e) => e);
		expect(error.message).toContain(`Cannot reconstruct the state of migration ${folder}: `);
		expect(error.message).toContain('tables ["public","users"]');
		expect(error.message).toContain(reconstructFix(folder!));
		expect(errorToEnvelope(error)).toStrictEqual(malformedEnvelope(folder!));
	}
	expect(flow.files('main')).toStrictEqual(before);
});

test('check with a schema path warns that the schema was not compared when a leaf does not reconstruct', async () => {
	const flow = createFolderFlow();
	const accounts = pgTable('accounts', { id: integer() });
	const v1 = { users: pgTable('users', { id: integer() }), accounts };
	const v2 = { users: pgTable('users', { id: integer(), email: varchar() }), accounts };
	await flow.generate('main', v1);
	const { folder } = await flow.generate('main', v2);
	flow.appendDeltas('main', folder!, renameUsersTo('accounts'));

	const warnings = await flow.schemaWarnings('main', v2);

	expect(warnings).toStrictEqual([{
		kind: 'not_compared',
		message: expect.stringContaining(`The error: Cannot reconstruct the state of migration ${folder}: `),
	}]);
});

test('a snapshot that holds an instruction operation stops check and generate, and the error carries its path', async () => {
	const flow = createFolderFlow();
	const v1 = { users: pgTable('users', { id: integer() }) };
	const v2 = { users: pgTable('users', { id: integer(), email: varchar() }) };
	await flow.generate('main', v1);
	const { folder } = await flow.generate('main', v2);
	const instruction = { op: 'update', type: 'columns', where: { table: 'users' }, set: { table: 'accounts' } };
	flow.appendDeltas('main', folder!, instruction as unknown as Delta);
	const before = flow.files('main');

	for (const run of [() => flow.check('main'), () => flow.generate('main', v2)]) {
		expect(errorToEnvelope(await run().catch((e) => e))).toStrictEqual(malformedEnvelope(folder!));
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

	expect(flow.sql('main', folder!)).toBe('DROP TABLE "users";');
	expect(flow.deltas('main', folder!).map((it) => (it.op === 'drop' ? it.key : it)).sort()).toStrictEqual([
		'columns\0["public","users","email"]',
		'columns\0["public","users","id"]',
		'indexes\0["public","users_email_idx"]',
		'pks\0["public","users","users_pk"]',
		'tables\0["public","users"]',
		'uniques\0["public","users","users_email_unique"]',
	]);
	expect(flow.state('main', folder!)).toStrictEqual(schemaState({ posts }));
});

// A drop removes one entity and follows no edge. So the index stays in the state, and its own delta gives it
// the column list that it has after the column drop.
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

	expect(flow.state('main', folder!)).toStrictEqual(schemaState(v2));
	expect(await flow.generate('main', v2)).toMatchObject({ status: 'no_changes' });
	expect(await flow.migrate('main', v2)).toStrictEqual([]);
});

test('generate names the leaf that does not reconstruct when it is not the first parent', async () => {
	const flow = createFolderFlow();
	const users = pgTable('users', { id: integer() });
	const likes = pgTable('likes', { id: integer() });
	const groups = pgTable('groups', { id: integer() });
	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	const older = await flow.generate('a', { users, likes });
	const newer = await flow.generate('b', { users, groups });
	flow.merge('main', 'a', 'b');
	flow.appendDeltas('main', older.folder!, renameUsersTo('likes'));
	expect(flow.leaves('main')).toStrictEqual([older.folder, newer.folder]);
	const before = flow.files('main');

	const error = await flow.generate('main', { users, likes, groups, posts: pgTable('posts', { id: integer() }) })
		.catch((e) => e);

	expect(error.message).toContain(`Cannot reconstruct the state of migration ${older.folder}: `);
	expect(error.message).toContain(reconstructFix(older.folder!));
	expect(errorToEnvelope(error)).toStrictEqual(malformedEnvelope(older.folder!));
	expect(flow.files('main')).toStrictEqual(before);
});

test('generate --fix-conflicts does not reconstruct a leaf that the fix deletes', async () => {
	const flow = createFolderFlow();
	const tags = pgTable('tags', { id: integer() });
	await flow.generate('main', { users: pgTable('users', { score: integer() }) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	const a = await flow.generate('a', { users: pgTable('users', { score: integer().default(1) }), tags });
	const b = await flow.generate('b', { users: pgTable('users', { score: integer().default(2) }) });
	flow.merge('main', 'a', 'b');
	flow.appendDeltas('main', a.folder!, renameUsersTo('tags'));
	const resolved = { users: pgTable('users', { score: integer().default(3) }), tags };

	const { folder, deleted } = await flow.generate('main', resolved, { fixConflicts: true });

	expect(deleted).toStrictEqual([a.folder, b.folder]);
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(resolved));
});

test('a custom migration on two leaves lists both leaves as parents and stores no deltas and no statements', async () => {
	const flow = createFolderFlow();
	const users = pgTable('users', { id: integer() });
	const likes = pgTable('likes', { id: integer() });
	const groups = pgTable('groups', { id: integer() });
	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	const older = await flow.generate('a', { users, likes });
	const newer = await flow.generate('b', { users, groups });
	flow.merge('main', 'a', 'b');

	const { folder } = await flow.generate('main', { users, likes, groups }, { custom: true });

	expect(flow.snapshot('main', folder!)).toMatchObject({
		type: 'diff',
		prevIds: [newer.folder!, older.folder!].map((it) => flow.snapshot('main', it).id),
		deltas: [],
		statements: [],
	});
	expect(flow.leaves('main')).toStrictEqual([folder]);
	expect(flow.state('main', folder!)).toStrictEqual(schemaState({ users, likes, groups }));
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
				hints: [{
					type: 'rename',
					kind: 'column',
					from: ['public', 'users', 'email'],
					to: ['public', 'users', 'contact'],
				}],
			})).folder,
		},
		{
			schema: v4,
			folder: (await flow.generate('main', v4, {
				hints: [{ type: 'rename', kind: 'table', from: ['public', 'users'], to: ['public', 'accounts'] }],
			})).folder,
		},
		{ schema: v4, folder: (await flow.generate('main', v4, { custom: true })).folder },
	];
	const unchanged = await flow.generate('main', v4);

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
		expect(flow.state('main', folder!)).toStrictEqual(schemaState(schema));
	}
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', v4)).toStrictEqual([]);
});

test('commuting fork merges into one leaf that holds only the new change', async () => {
	const flow = createFolderFlow();
	const users = pgTable('users', { id: integer() });
	const likes = pgTable('likes', { id: integer() });
	const groups = pgTable('groups', { id: integer() });

	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users, likes });
	await flow.generate('b', { users, groups });
	flow.merge('main', 'a', 'b');

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
	const flow = createFolderFlow();

	await flow.generate('main', { users: pgTable('users', { email: varchar() }) });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users: pgTable('users', { email: text() }) });
	await flow.generate('b', { users: pgTable('users', { email: integer() }) });
	flow.merge('main', 'a', 'b');

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
	const flow = createFolderFlow();
	const legacy = tempDir('dk-format-8-');
	writeSnapshot(legacy, '20250101000000_init', {
		version: '8',
		dialect: 'postgres',
		id: 'p1',
		prevIds: [ORIGIN],
		ddl: [],
		renames: [],
	});
	flow.seed('main', legacy);
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
	expect(flow.snapshot('main', folder!)).toMatchObject({ type: 'diff', prevIds: ['p1'] });
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(v1));
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
	expect(base).not.toHaveProperty('stateHash');
	expect(flow.state('main', pulled)).toStrictEqual(schemaState(v1));

	const { folder } = await flow.generate('main', v2);

	expect(flow.folders('main')).toStrictEqual([pulled, folder]);
	expect(flow.snapshot('main', folder!)).toStrictEqual({
		type: 'diff',
		version: '9',
		dialect: 'postgres',
		id: flow.snapshot('main', folder!).id,
		prevIds: [base.id],
		statements: [expect.objectContaining({ type: 'add_column' })],
		deltas: [expect.objectContaining({ op: 'create', row: expect.objectContaining({ name: 'email' }) })],
	});
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(v2));
});
