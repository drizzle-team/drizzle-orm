import { PGlite } from '@electric-sql/pglite';
import { index, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { join } from 'path';
import { errorToEnvelope } from 'src/cli/errors';
import { createDDL } from 'src/dialects/postgres/ddl';
import { reconstruct, stateHash } from 'src/dialects/postgres/snapshot';
import { expect, onTestFinished, test } from 'vitest';
import { ORIGIN, writeSnapshot } from '../other/check-fixtures';
import { columnRow, createFolderFlow, schemaState, tempDir } from './folder-flow';
import { drizzleToDDL } from './mocks';

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
	// The rename is followed by one instruction for every reference rule that points at columns.
	const inUsers = { schema: 'public', table: 'users' };
	const renamed = { field: 'columns', from: 'email', to: 'contact' };
	expect(third).toStrictEqual({
		type: 'diff',
		version: '9',
		dialect: 'postgres',
		id: third.id,
		prevIds: [second.id],
		statements: [expect.objectContaining({ type: 'rename_column' })],
		deltas: [
			{ op: 'rename', key: 'columns\0["public","users","email"]', set: { name: 'contact' } },
			{
				op: 'update_list_items',
				type: 'indexes',
				where: inUsers,
				field: 'columns',
				match: { value: 'email', isExpression: false },
				set: { value: 'contact' },
			},
			{ op: 'replace_in_list', type: 'pks', where: inUsers, ...renamed },
			{ op: 'replace_in_list', type: 'uniques', where: inUsers, ...renamed },
			{ op: 'replace_in_list', type: 'fks', where: inUsers, ...renamed },
			{
				op: 'replace_in_list',
				type: 'fks',
				where: { schemaTo: 'public', tableTo: 'users' },
				...renamed,
				field: 'columnsTo',
			},
		],
		stateHash: expect.stringMatching(/^[0-9a-f]{64}$/),
	});

	expect(flow.leaves('main')).toStrictEqual(['20260101120003_main']);
	expect(flow.state('main', '20260101120003_main')).toStrictEqual(schemaState(v3));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', v3)).toStrictEqual([]);
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

test('generate stores the hash of the state after each migration', async () => {
	const flow = createFolderFlow();
	const v1 = { users: pgTable('users', { id: integer() }) };
	const v2 = { users: pgTable('users', { id: integer(), email: varchar() }) };
	const first = await flow.generate('main', v1);
	const second = await flow.generate('main', v2);
	const custom = await flow.generate('main', v2, { custom: true });

	const hashOf = (schema: Parameters<typeof drizzleToDDL>[0]) => stateHash(drizzleToDDL(schema).ddl);
	expect(flow.snapshot('main', first.folder!).stateHash).toBe(hashOf(v1));
	expect(flow.snapshot('main', second.folder!).stateHash).toBe(hashOf(v2));
	expect(flow.snapshot('main', custom.folder!).stateHash).toBe(hashOf(v2));
});

test('a snapshot that was edited by hand stops check and generate, and the error names it', async () => {
	const flow = createFolderFlow();
	const v1 = { users: pgTable('users', { id: integer() }) };
	const v2 = { users: pgTable('users', { id: integer(), email: varchar() }) };
	const v3 = { users: pgTable('users', { id: integer(), email: varchar(), age: integer() }) };
	await flow.generate('main', v1);
	const { folder } = await flow.generate('main', v2);
	const edited = flow.snapshot('main', folder!);
	if (edited.type !== 'diff') throw new Error('The second migration must have a diff snapshot.');
	edited.deltas[0] = { op: 'create', row: columnRow('users', 'mail', 'varchar') };
	flow.overwriteSnapshot('main', folder!, JSON.stringify(edited, null, 2));
	const before = flow.files('main');

	const message = `Cannot rebuild snapshot ${folder}: the rebuilt state differs from the state that the snapshot `
		+ `recorded. A snapshot.json in the history of ${folder} was edited by hand, or this drizzle-kit version `
		+ 'rebuilds the history in another way than the version that wrote it.';
	await expect(flow.check('main')).rejects.toThrow(message);
	await expect(flow.generate('main', v3)).rejects.toThrow(message);
	expect(errorToEnvelope(await flow.check('main').catch((e) => e))).toStrictEqual({
		status: 'error',
		error: {
			code: 'check_error',
			kind: 'state_hash',
			snapshot: expect.stringContaining(join(folder!, 'snapshot.json')),
		},
	});
	expect(flow.files('main')).toStrictEqual(before);
});

test('an edited snapshot in the middle of a history fails at the leaf that follows it', async () => {
	const flow = createFolderFlow();
	const v1 = { users: pgTable('users', { id: integer(), email: varchar() }) };
	const v2 = { users: pgTable('users', { id: integer(), email: varchar().notNull() }) };
	const first = await flow.generate('main', v1);
	const second = await flow.generate('main', v2);
	const base = flow.snapshot('main', first.folder!);
	if (base.type !== 'base') throw new Error('The first migration must have a base snapshot.');
	const rows = base.ddl.map((
		row,
	) => (row.entityType === 'columns' && row.name === 'id' ? { ...row, type: 'bigint' } : row));
	flow.overwriteSnapshot('main', first.folder!, JSON.stringify({ ...base, ddl: rows }, null, 2));

	await expect(flow.check('main')).rejects.toThrow(
		`Cannot rebuild snapshot ${second.folder}: the rebuilt state differs from the state that the snapshot recorded.`,
	);
});

test('check compares two independent first migrations', async () => {
	const flow = createFolderFlow();
	flow.branch('a');
	flow.branch('b');
	flow.branch('c');
	await flow.generate('a', { users: pgTable('users', { id: integer() }) });
	await flow.generate('b', { users: pgTable('users', { id: integer(), email: varchar() }) });
	await flow.generate('c', { posts: pgTable('posts', { id: integer() }) });

	flow.merge('main', 'a', 'c');
	expect(flow.folders('main').map((it) => flow.snapshot('main', it).type)).toStrictEqual(['base', 'base']);
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });

	flow.merge('main', 'b');
	expect(await flow.check('main')).toMatchObject({
		status: 'conflicts',
		folders: ['20260101120001_a', '20260101120002_b'],
	});
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
		stateHash: stateHash(createDDL()),
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
	expect(base.stateHash).toBe(stateHash(reconstruct(flow.history('main'), base.id)));
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
		stateHash: expect.stringMatching(/^[0-9a-f]{64}$/),
	});
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(v2));
});
