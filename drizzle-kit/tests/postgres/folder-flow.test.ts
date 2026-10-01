import { PGlite } from '@electric-sql/pglite';
import { index, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { expect, onTestFinished, test } from 'vitest';
import { ORIGIN, writeSnapshot } from '../other/check-fixtures';
import { columnRow, createFolderFlow, schemaState, tempDir } from './folder-flow';

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
		deltas: [{ op: 'rename', key: 'columns\0["public","users","email"]', set: { name: 'contact' } }],
	});

	expect(flow.leaves('main')).toStrictEqual(['20260101120003_main']);
	expect(flow.state('main', '20260101120003_main')).toStrictEqual(schemaState(v3));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', v3)).toStrictEqual([]);
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
		expect(it).not.toHaveProperty('statements');
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
	await flow.generate('a', { users: pgTable('users', { email: varchar().notNull() }) });
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
	expect(flow.state('main', pulled)).toStrictEqual(schemaState(v1));

	const { folder } = await flow.generate('main', v2);

	expect(flow.folders('main')).toStrictEqual([pulled, folder]);
	expect(flow.snapshot('main', folder!)).toStrictEqual({
		type: 'diff',
		version: '9',
		dialect: 'postgres',
		id: flow.snapshot('main', folder!).id,
		prevIds: [base.id],
		deltas: [expect.objectContaining({ op: 'create', row: expect.objectContaining({ name: 'email' }) })],
	});
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(v2));
});
