import { PGlite } from '@electric-sql/pglite';
import { integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { checkHandler } from 'src/cli/commands/check';
import { errorToEnvelope } from 'src/cli/errors';
import { prepareOutFolder } from 'src/utils/utils-node';
import { expect, onTestFinished, test } from 'vitest';
import { ORIGIN, writeSnapshot } from '../other/check-fixtures';
import { createFolderFlow, forkFlow, schemaState, step, tempDir } from './folder-flow';

const v1 = { users: pgTable('users', { id: integer() }) };
const v2 = { users: pgTable('users', { id: integer(), email: varchar() }) };
const v3 = { users: pgTable('users', { id: integer(), email: varchar(), age: integer() }) };

test('deleting a middle migration stops every command with the missing parent and the fix', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	await flow.generate('main', v2);
	await flow.generate('main', v3);
	const missing = flow.snapshot('main', '20260101120002_main').id;
	flow.deleteFolder('main', '20260101120002_main');

	const message =
		`Cannot reconstruct snapshot 20260101120003_main: snapshot ${missing} is missing from the migrations folder. `
		+ 'Restore the missing migration folder from git, '
		+ 'or delete 20260101120003_main and every later migration, then run generate again.';
	await expect(flow.check('main')).rejects.toThrow(message);
	await expect(flow.generate('main', v3)).rejects.toThrow(message);
	// `up` does not throw for this broken folder, because it converts only older formats and does not check
	// the history of format 9 snapshots.
	expect(await flow.up('main')).toStrictEqual([]);
	const client = new PGlite();
	onTestFinished(() => client.close());
	await expect(flow.pull('main', client)).rejects.toThrow(message);
	expect(flow.folders('main')).toStrictEqual(['20260101120001_main', '20260101120003_main']);

	expect(errorToEnvelope(await flow.check('main').catch((e) => e))).toStrictEqual({
		status: 'error',
		error: {
			code: 'check_error',
			kind: 'malformed',
			snapshot: expect.stringMatching(/20260101120003_main[/\\]snapshot\.json$/),
			parentId: missing,
		},
	});
});

test('deleting the first migration stops every command because the base is missing', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	await flow.generate('main', v2);
	flow.deleteFolder('main', '20260101120001_main');

	const message = 'Cannot reconstruct snapshot 20260101120002_main: its history does not reach a base snapshot. '
		+ 'Restore the first migration folder from git, '
		+ 'or delete 20260101120002_main and every later migration, then run generate again.';
	await expect(flow.check('main')).rejects.toThrow(message);
	await expect(flow.generate('main', v3)).rejects.toThrow(message);
	expect(flow.folders('main')).toStrictEqual(['20260101120002_main']);
});

// Branches a and b start from an empty folder, so the first generate on each branch writes a base snapshot.
test('a second base snapshot stops check, generate and pull, and the error names both migration folders', async () => {
	const flow = createFolderFlow();
	flow.branch('a');
	flow.branch('b');
	await flow.generate('a', v1);
	await flow.generate('b', { posts: pgTable('posts', { id: integer() }) });
	flow.merge('main', 'a', 'b');
	const before = flow.files('main');

	const message = 'The migrations folder has two base snapshots, in 20260101120001_a and 20260101120002_b. '
		+ 'A folder must have one base snapshot, which is its first migration. Delete one of the two migration folders '
		+ 'together with every migration that follows it, then run generate again.';
	await expect(flow.check('main')).rejects.toThrow(message);
	await expect(flow.generate('main', v1)).rejects.toThrow(message);
	const client = new PGlite();
	onTestFinished(() => client.close());
	await expect(flow.pull('main', client)).rejects.toThrow(message);
	expect(errorToEnvelope(await flow.check('main').catch((e) => e))).toStrictEqual({
		status: 'error',
		error: {
			code: 'check_error',
			kind: 'malformed',
			snapshot: expect.stringMatching(/20260101120002_b[/\\]snapshot\.json$/),
			baseSnapshot: expect.stringMatching(/20260101120001_a[/\\]snapshot\.json$/),
		},
	});
	expect(flow.files('main')).toStrictEqual(before);
});

test('a folder that sorts before its parent stops every command and names both folders', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	await flow.generate('main', v2);
	flow.renameFolder('main', '20260101120002_main', '20260101115959_main');

	const message =
		'Migration 20260101115959_main sorts before its parent 20260101120001_main, so migrate can run it first. '
		+ 'Rename the folders so that 20260101115959_main sorts after 20260101120001_main.';
	await expect(flow.check('main')).rejects.toThrow(message);
	await expect(flow.generate('main', v3)).rejects.toThrow(message);
	expect(errorToEnvelope(await flow.check('main').catch((e) => e))).toStrictEqual({
		status: 'error',
		error: {
			code: 'check_error',
			kind: 'order',
			snapshot: expect.stringMatching(/20260101115959_main[/\\]snapshot\.json$/),
			parentSnapshot: expect.stringMatching(/20260101120001_main[/\\]snapshot\.json$/),
		},
	});
});

const conflictMarkers = '<<<<<<< HEAD\n{ "id": "a" }\n=======\n{ "id": "b" }\n>>>>>>> feature\n';

test('a snapshot file that does not parse stops every command and names that file', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	await flow.generate('main', v2);
	await flow.generate('main', v3);
	flow.overwriteSnapshot('main', '20260101120002_main', conflictMarkers);

	const message =
		/20260101120002_main[/\\]snapshot\.json data is malformed\. Restore the file from git, or fix the JSON in it by hand\.$/;
	await expect(flow.check('main')).rejects.toThrow(message);
	await expect(flow.generate('main', v3)).rejects.toThrow(message);
	await expect(flow.up('main')).rejects.toThrow(message);
	expect(errorToEnvelope(await flow.check('main').catch((e) => e))).toStrictEqual({
		status: 'error',
		error: {
			code: 'check_error',
			kind: 'malformed',
			snapshot: expect.stringMatching(/20260101120002_main[/\\]snapshot\.json$/),
		},
	});
});

test('a base snapshot file that does not parse stops check and names that file', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	await flow.generate('main', v2);
	flow.overwriteSnapshot('main', '20260101120001_main', conflictMarkers);

	await expect(flow.check('main')).rejects.toThrow(
		/20260101120001_main[/\\]snapshot\.json data is malformed\. Restore the file from git, or fix the JSON in it by hand\.$/,
	);
});

test('deleting the newest migration leaves generate working', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	await flow.generate('main', v2);
	await flow.generate('main', v3);
	flow.deleteFolder('main', '20260101120003_main');
	const redo = { users: pgTable('users', { id: integer(), email: varchar(), name: text() }) };

	const { folder } = await flow.generate('main', redo);

	expect(folder).toBe('20260101120004_main');
	expect(flow.snapshot('main', folder).prevIds).toStrictEqual([flow.snapshot('main', '20260101120002_main').id]);
	expect(flow.sql('main', folder)).toBe('ALTER TABLE "users" ADD COLUMN "name" text;');
	expect(flow.state('main', folder)).toStrictEqual(schemaState(redo));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', redo)).toStrictEqual([]);
});

test('deleting a migration and every later one leaves generate working', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	await flow.generate('main', v2);
	await flow.generate('main', v3);
	flow.deleteFolder('main', '20260101120002_main');
	flow.deleteFolder('main', '20260101120003_main');
	const redo = { users: pgTable('users', { id: integer(), name: text() }) };

	const { folder } = await flow.generate('main', redo);

	expect(flow.folders('main')).toStrictEqual(['20260101120001_main', '20260101120004_main']);
	expect(flow.snapshot('main', folder).prevIds).toStrictEqual([flow.snapshot('main', '20260101120001_main').id]);
	expect(flow.sql('main', folder)).toBe('ALTER TABLE "users" ADD COLUMN "name" text;');
	expect(flow.state('main', folder)).toStrictEqual(schemaState(redo));
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', redo)).toStrictEqual([]);
});

test('generate names the folder after its newest parent when the clock is behind', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);

	const behind = await flow.generate('main', v2, { at: new Date(Date.UTC(2025, 11, 31, 23, 0, 0)) });
	const sameSecond = await flow.generate('main', v3, { at: new Date(Date.UTC(2026, 0, 1, 12, 0, 2, 500)) });

	expect(behind.folder).toBe('20260101120002_main');
	expect(sameSecond.folder).toBe('20260101120003_main');
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', v3)).toStrictEqual([]);
});

test('a merge folder sorts after its newest parent when the clock is behind', async () => {
	const users = pgTable('users', { id: integer() });
	const likes = pgTable('likes', { id: integer() });
	const groups = pgTable('groups', { id: integer() });
	const { flow } = await forkFlow({
		base: { users },
		branches: [
			[step({ users, likes })],
			[{ schema: { users, groups }, at: new Date(Date.UTC(2026, 0, 1, 13, 0, 0)) }],
		],
	});
	const merged = { users: pgTable('users', { id: integer(), email: varchar() }), likes, groups };

	const { folder } = await flow.generate('main', merged, { at: new Date(Date.UTC(2026, 0, 1, 12, 30, 0)) });

	expect(flow.folders('main')).toStrictEqual([
		'20260101120001_main',
		'20260101120002_a',
		'20260101130000_b',
		'20260101130001_main',
	]);
	expect(folder).toBe('20260101130001_main');
	expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
	expect(await flow.migrate('main', merged)).toStrictEqual([]);
});

test('folders of other dialects keep loading with a broken history', async () => {
	const out = tempDir('dk-sqlite-integrity-');
	const sqlite = (id: string, prevIds: string[]) => ({
		version: '7',
		dialect: 'sqlite',
		id,
		prevIds,
		ddl: [],
		renames: [],
	});
	writeSnapshot(out, '20260101120001_first', sqlite('a', [ORIGIN]));
	writeSnapshot(out, '20260101120000_second', sqlite('b', ['a']));
	writeSnapshot(out, '20260101120002_third', sqlite('c', ['gone']));
	mkdirSync(join(out, '20260101120003_broken'));
	writeFileSync(join(out, '20260101120003_broken', 'snapshot.json'), conflictMarkers);

	expect(prepareOutFolder(out).snapshots).toHaveLength(4);
	await expect(checkHandler(out, 'sqlite')).rejects.toThrow(
		/20260101120003_broken[/\\]snapshot\.json data is malformed\. Restore the file from git, or fix the JSON in it by hand\.$/,
	);
});
