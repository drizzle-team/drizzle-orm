import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { readFileSync } from 'fs';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { type PostgresSchemaState, snapshotValidator } from 'src/dialects/postgres/snapshot';
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

const format8 = (state: PostgresSchemaState) => ({
	version: '8',
	dialect: 'postgres',
	id: state.id,
	prevIds: state.prevIds,
	ddl: state.ddl,
	renames: [],
});

const oldSnapshot = (path: string) => JSON.parse(readFileSync(`tests/postgres/old-snapshots/${path}`, 'utf8'));

const folderFiles = (flow: FolderFlow, branch: string) =>
	Object.fromEntries(flow.folders(branch).map((folder) => [folder, flow.snapshot(branch, folder)]));

const addEmail = ['ALTER TABLE "users" ADD COLUMN "email" varchar;'];
const dropEmail = ['ALTER TABLE "users" DROP COLUMN "email";'];

test('generateDrizzleJson returns a schema state, which is not a snapshot', async () => {
	const state = await generateDrizzleJson(v1);

	expect(Object.keys(state).sort()).toStrictEqual(['ddl', 'dialect', 'id', 'prevIds', 'version']);
	expect(state).toMatchObject({ version: '9', dialect: 'postgres', prevIds: [ORIGIN] });
	expect(state.ddl).toContainEqual(expect.objectContaining({ entityType: 'tables', name: 'users' }));
	expect(await generateDrizzleJson(v1, '')).toMatchObject({ prevIds: [ORIGIN] });
	expect(snapshotValidator.parse(state).success).toBe(false);
});

test('generateDrizzleJson with a prevId returns a schema state with that parent', async () => {
	const parent = await generateDrizzleJson(v1);

	const single = await generateDrizzleJson(v2, parent.id);
	const several = await generateDrizzleJson(v2, [parent.id, 'other-leaf']);

	expect(single.prevIds).toStrictEqual([parent.id]);
	expect(several.prevIds).toStrictEqual([parent.id, 'other-leaf']);
	expect(await generateMigration(parent, single)).toStrictEqual(addEmail);
	expect(await generateMigration(parent, several)).toStrictEqual(addEmail);
});

// Payload saves each state as a JSON file, reads the newest file back as the previous state, and asks for
// the SQL in both directions.
test('generateMigration gives the up and the down SQL for a state that was saved as JSON', async () => {
	const before = JSON.parse(JSON.stringify(await generateDrizzleJson(v1)));
	const after = await generateDrizzleJson(v2);

	expect(await generateMigration(before, after)).toStrictEqual(addEmail);
	expect(await generateMigration(after, before)).toStrictEqual(dropEmail);
});

test('generateMigration ignores the id, the parents and the type of its arguments', async () => {
	const before = await generateDrizzleJson(v1);
	const after = await generateDrizzleJson(v2, 'not-the-id-of-before');
	const base = { ...before, type: 'base', id: after.id, prevIds: [after.id] };

	expect(await generateMigration(base, after)).toStrictEqual(addEmail);
	expect(await generateMigration(after, base)).toStrictEqual(dropEmail);
});

test('generateMigration takes format 8 states in either argument position', async () => {
	const before = await generateDrizzleJson(v1);
	const after = await generateDrizzleJson(v2);

	expect(await generateMigration(format8(before), format8(after))).toStrictEqual(addEmail);
	expect(await generateMigration(format8(before), after)).toStrictEqual(addEmail);
	expect(await generateMigration(after, format8(before))).toStrictEqual(dropEmail);
});

test('generateMigration converts format 5 and format 7 states in either argument position', async () => {
	const empty = { version: '8', dialect: 'postgres', id: 'p1', prevIds: [ORIGIN], ddl: [], renames: [] };

	const v5 = oldSnapshot('format-5/meta/0000_snapshot.json');
	expect(v5.version).toBe('5');
	expect(await generateMigration(empty, v5)).toContainEqual(expect.stringContaining('CREATE TABLE "users"'));
	expect(await generateMigration(v5, empty)).toStrictEqual(['DROP TABLE "users";']);

	const v7 = [oldSnapshot('format-7/meta/0000_snapshot.json'), oldSnapshot('format-7/meta/0001_snapshot.json')];
	expect(v7.map((it) => it.version)).toStrictEqual(['7', '7']);
	expect(await generateMigration(v7[0], v7[1])).toContainEqual(expect.stringContaining('CREATE TABLE "posts"'));
	expect(await generateMigration(v7[1], v7[0])).toContainEqual('DROP TABLE "posts";');
});

test('generateMigration takes an empty previous state in format 7 and in format 8', async () => {
	const after = await generateDrizzleJson(v1);
	const createUsers = ['CREATE TABLE "users" (\n\t"id" integer\n);\n'];
	// Payload starts from this state when it has no saved file. Its parent id is one digit short of the origin id.
	const payloadDefault = {
		id: '00000000-0000-0000-0000-000000000000',
		_meta: { columns: {}, schemas: {}, tables: {} },
		dialect: 'postgresql',
		enums: {},
		prevId: '00000000-0000-0000-0000-00000000000',
		schemas: {},
		tables: {},
		version: '7',
	};
	const empty8 = { version: '8', dialect: 'postgres', id: 'p1', prevIds: [ORIGIN], ddl: [], renames: [] };

	expect(await generateMigration(payloadDefault, after)).toStrictEqual(createUsers);
	expect(await generateMigration(after, payloadDefault)).toStrictEqual(['DROP TABLE "users";']);
	expect(await generateMigration(empty8, after)).toStrictEqual(createUsers);
	expect(await generateMigration(after, empty8)).toStrictEqual(['DROP TABLE "users";']);
});

test('generateMigration rejects a diff snapshot', async () => {
	const parent = await generateDrizzleJson(v1);
	const diff = {
		type: 'diff',
		version: '9',
		dialect: 'postgres',
		id: 'd1',
		prevIds: [parent.id],
		deltas: [],
		statements: [],
	};

	await expect(generateMigration(parent, diff)).rejects.toThrow(
		'Snapshot d1 is a diff snapshot, so it holds only the changes of one migration. '
			+ 'Rebuild the state of d1 with reconstruct first, and pass that state.',
	);
});

test('up converts one saved state of an older format without a history', () => {
	const first = up({ version: '8', dialect: 'postgres', id: 'p1', prevIds: [ORIGIN], ddl: [], renames: ['a->b'] });
	const second = up({ version: '8', dialect: 'postgres', id: 'p2', prevIds: ['p1'], ddl: [], renames: [] });
	const legacy = up(oldSnapshot('format-7/meta/0001_snapshot.json'));

	expect(first).toStrictEqual({
		snapshot: { version: '9', dialect: 'postgres', id: 'p1', prevIds: [ORIGIN], ddl: [] },
		hints: [],
	});
	expect(second.snapshot).toStrictEqual({ version: '9', dialect: 'postgres', id: 'p2', prevIds: ['p1'], ddl: [] });
	expect(legacy.snapshot).toMatchObject({ version: '9', dialect: 'postgres' });
	expect(legacy.snapshot.ddl).toContainEqual(expect.objectContaining({ entityType: 'tables', name: 'posts' }));
});

test('up returns a schema state unchanged', async () => {
	const state = await generateDrizzleJson(v1);

	expect(up(JSON.parse(JSON.stringify(state)))).toStrictEqual({ snapshot: state, hints: [] });
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
	expect(second).toStrictEqual({
		version: '9',
		dialect: 'postgres',
		id: middle.id,
		prevIds: middle.prevIds,
		ddl: second.ddl,
	});
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

test('reconstruct reports a second base snapshot with the same message as the CLI', async () => {
	const flow = createFolderFlow();
	flow.branch('a');
	flow.branch('b');
	await flow.generate('a', v1);
	await flow.generate('b', { posts });
	flow.merge('main', 'a', 'b');

	const cli: Error = await flow.check('main').catch((e) => e);
	const api: Error = await reconstruct(folderFiles(flow, 'main')).catch((e) => e);

	expect(cli.message).toContain('has two base snapshots, in 20260101120001_a and 20260101120002_b.');
	expect(api.message).toBe(cli.message);
});

test('reconstruct reports a malformed snapshot, an unknown id and an empty folder', async () => {
	const base = {
		type: 'base',
		version: '9',
		dialect: 'postgres',
		id: 'b1',
		prevIds: [ORIGIN],
		ddl: [],
		statements: [],
	};

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
