import { integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { readFileSync } from 'fs';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { type PostgresStateSnapshot, snapshotValidator } from 'src/dialects/postgres/snapshot';
import { generateDrizzleJson, generateMigration, reconstruct, up } from 'src/ext/api-postgres';
import { expect, test } from 'vitest';
import { ORIGIN } from '../other/check-fixtures';
import { createFolderFlow, type FolderFlow, schemaState } from './folder-flow';

const users = pgTable('users', { id: integer() });
const likes = pgTable('likes', { id: integer() });
const posts = pgTable('posts', { id: integer() });
const v1 = { users };
const v2 = { users: pgTable('users', { id: integer(), email: varchar() }) };
const v3 = { users: pgTable('users', { id: integer(), email: varchar(), age: integer() }) };

const format8 = (snapshot: PostgresStateSnapshot) => ({
	version: '8',
	dialect: 'postgres',
	id: snapshot.id,
	prevIds: snapshot.prevIds,
	ddl: snapshot.ddl,
	renames: [],
});

const folderFiles = (flow: FolderFlow, branch: string) =>
	Object.fromEntries(flow.folders(branch).map((folder) => [folder, flow.snapshot(branch, folder)]));

test('generateDrizzleJson returns a format 9 base snapshot', async () => {
	const snapshot = await generateDrizzleJson(v1);

	expect(snapshotValidator.parse(snapshot).success).toBe(true);
	expect(snapshot).toMatchObject({ type: 'base', version: '9', dialect: 'postgres', prevIds: [ORIGIN] });
	expect(snapshot.ddl).toContainEqual(expect.objectContaining({ entityType: 'tables', name: 'users' }));
	expect(await generateDrizzleJson(v1, '')).toMatchObject({ type: 'base', prevIds: [ORIGIN] });
});

test('generateDrizzleJson with a prevId returns a checkpoint, and prevId can be a string or an array', async () => {
	const parent = await generateDrizzleJson(v1);

	const single = await generateDrizzleJson(v2, parent.id);
	const several = await generateDrizzleJson(v2, [parent.id, 'other-leaf']);

	expect(snapshotValidator.parse(single).success).toBe(true);
	expect(snapshotValidator.parse(several).success).toBe(true);
	expect(single).toMatchObject({ type: 'checkpoint', version: '9', prevIds: [parent.id] });
	expect(several).toMatchObject({ type: 'checkpoint', version: '9', prevIds: [parent.id, 'other-leaf'] });
	const expected = ['ALTER TABLE "users" ADD COLUMN "email" varchar;'];
	expect(await generateMigration(parent, single)).toStrictEqual(expected);
	expect(await generateMigration(parent, several)).toStrictEqual(expected);
});

test('generateMigration gives the same SQL for format 8 and format 9 snapshots of the same schemas', async () => {
	const parent = await generateDrizzleJson(v1);
	const current = await generateDrizzleJson(v3, parent.id);
	const expected = [
		'ALTER TABLE "users" ADD COLUMN "email" varchar;',
		'ALTER TABLE "users" ADD COLUMN "age" integer;',
	];

	expect(await generateMigration(parent, current)).toStrictEqual(expected);
	expect(await generateMigration(format8(parent), format8(current))).toStrictEqual(expected);
	expect(await generateMigration(format8(parent), current)).toStrictEqual(expected);
});

test('generateMigration upgrades a format 7 snapshot', async () => {
	const legacy = JSON.parse(readFileSync('tests/postgres/snapshots/snapshot05-0.23.2.json', 'utf8'));
	const current = await generateDrizzleJson({
		users: pgTable('users', {
			id: serial().primaryKey(),
			name: text().notNull(),
			email: text().notNull().unique(),
			password: text().notNull(),
			avatar: text(),
			createdAt: timestamp().notNull().defaultNow(),
			age: integer(),
		}),
	});

	expect(await generateMigration(legacy, current)).toStrictEqual(['ALTER TABLE "users" ADD COLUMN "age" integer;']);
});

test('generateMigration rejects a diff snapshot', async () => {
	const parent = await generateDrizzleJson(v1);
	const diff = { type: 'diff', version: '9', dialect: 'postgres', id: 'd1', prevIds: [parent.id], deltas: [] };

	await expect(generateMigration(parent, diff)).rejects.toThrow(
		'Snapshot d1 is a diff snapshot, so it holds only the changes of one migration. '
			+ 'Pass a base or checkpoint snapshot, or rebuild the state of d1 with reconstruct first.',
	);
});

test('up returns a format 9 base or checkpoint snapshot', () => {
	const base = up({ version: '8', dialect: 'postgres', id: 'p1', prevIds: [ORIGIN], ddl: [], renames: ['a->b'] });
	const checkpoint = up({ version: '8', dialect: 'postgres', id: 'p2', prevIds: ['p1'], ddl: [], renames: [] });
	const legacy = up(JSON.parse(readFileSync('tests/postgres/snapshots/snapshot05-0.23.2.json', 'utf8')));

	expect(base.snapshot).toStrictEqual({
		type: 'base',
		version: '9',
		dialect: 'postgres',
		id: 'p1',
		prevIds: [ORIGIN],
		ddl: [],
	});
	expect(checkpoint.snapshot).toStrictEqual({
		type: 'checkpoint',
		version: '9',
		dialect: 'postgres',
		id: 'p2',
		prevIds: ['p1'],
		ddl: [],
	});
	expect(snapshotValidator.parse(legacy.snapshot).success).toBe(true);
	expect(legacy.snapshot).toMatchObject({
		type: 'base',
		id: '023db181-c1ae-4a62-a48a-f6a7ef716b9b',
		prevIds: [ORIGIN],
	});
});

test('reconstruct rebuilds any snapshot of a linear folder, and the leaf when no id is given', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	await flow.generate('main', v2);
	await flow.generate('main', v3);
	const middle = flow.snapshot('main', '20260101120002_main');
	const files = folderFiles(flow, 'main');

	const leaf = await reconstruct(files);
	const second = await reconstruct(files, middle.id);

	expect(normalizeDDL(leaf.ddl)).toStrictEqual(schemaState(v3));
	expect(normalizeDDL(second.ddl)).toStrictEqual(schemaState(v2));
	expect(second).toMatchObject({ type: 'checkpoint', version: '9', id: middle.id, prevIds: middle.prevIds });
	expect(snapshotValidator.parse(second).success).toBe(true);
	expect(await generateMigration(second, leaf)).toStrictEqual(['ALTER TABLE "users" ADD COLUMN "age" integer;']);
});

// Branch a creates and then drops `likes`, so a merge replay out of folder-name order would keep `likes`.
test('reconstruct rebuilds a folder with a merge, and asks for an id while several leaves are open', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users, likes });
	await flow.generate('a', v1);
	await flow.generate('b', { users, posts });
	flow.merge('main', 'a', 'b');
	const open = folderFiles(flow, 'main');

	await expect(reconstruct(open)).rejects.toThrow(
		'The migrations folder has 2 leaf snapshots: 20260101120003_a, 20260101120004_b. '
			+ 'Pass the id of the snapshot to rebuild, or run generate to merge the leaves.',
	);
	const leafB = await reconstruct(open, flow.snapshot('main', '20260101120004_b').id);
	expect(normalizeDDL(leafB.ddl)).toStrictEqual(schemaState({ users, posts }));

	const merged = { users: v2.users, posts };
	const { folder } = await flow.generate('main', merged);
	expect(flow.snapshot('main', folder!).prevIds).toHaveLength(2);

	const state = await reconstruct(Object.fromEntries(Object.entries(folderFiles(flow, 'main')).reverse()));
	expect(normalizeDDL(state.ddl)).toStrictEqual(schemaState(merged));
});

test('reconstruct reports a missing parent with the same message as the CLI', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	await flow.generate('main', v2);
	await flow.generate('main', v3);
	flow.deleteFolder('main', '20260101120002_main');

	const cli: Error = await flow.check('main').catch((e) => e);
	const api: Error = await reconstruct(folderFiles(flow, 'main')).catch((e) => e);

	expect(cli.message).toMatch(/^Cannot rebuild snapshot 20260101120003_main: snapshot \S+ is missing/);
	expect(api.message).toBe(cli.message);
});

test('reconstruct reports a malformed snapshot, an unknown id and an empty folder', async () => {
	const base = { type: 'base', version: '9', dialect: 'postgres', id: 'b1', prevIds: [ORIGIN], ddl: [] };

	await expect(reconstruct({ '20260101120000_init': { ...base, ddl: 'broken' } })).rejects.toMatchObject({
		message: '20260101120000_init data is malformed. Restore the file from git, or fix the JSON in it by hand.',
	});
	await expect(reconstruct({ '20260101120000_init': base }, 'missing')).rejects.toMatchObject({
		message: 'Cannot rebuild snapshot missing: it is not in the migrations folder. '
			+ 'Check the snapshot id, or restore the migration folder from git.',
	});
	await expect(reconstruct({})).rejects.toMatchObject({
		message: 'The migrations folder has no snapshots. Pass the snapshot files of at least one migration.',
	});
});

test('reconstruct asks to run up for a format 8 snapshot', async () => {
	const files = {
		'20250101000000_init': { version: '8', dialect: 'postgres', id: 'p1', prevIds: [ORIGIN], ddl: [], renames: [] },
	};

	await expect(reconstruct(files)).rejects.toThrow(
		'20250101000000_init is not of the latest version, please run "drizzle-kit up"',
	);
});
