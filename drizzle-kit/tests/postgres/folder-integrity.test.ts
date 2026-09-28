import { PGlite } from '@electric-sql/pglite';
import { integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { checkHandler } from 'src/cli/commands/check';
import { errorToEnvelope } from 'src/cli/errors';
import type { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import { reconstruct } from 'src/dialects/postgres/snapshot';
import { prepareOutFolder } from 'src/utils/utils-node';
import { expect, onTestFinished, test } from 'vitest';
import { ORIGIN, writeSnapshot } from '../other/check-fixtures';
import { createFolderFlow, schemaState, tempDir } from './folder-flow';

const v1 = { users: pgTable('users', { id: integer() }) };
const v2 = { users: pgTable('users', { id: integer(), email: varchar() }) };
const v3 = { users: pgTable('users', { id: integer(), email: varchar(), age: integer() }) };

test('deleting a middle migration stops every command with the missing parent and the fix', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	await flow.generate('main', v2);
	await flow.generate('main', v3);
	const missing = flow.snapshot('main', '20260101120002_main').id;
	const leaf = flow.snapshot('main', '20260101120003_main').id;
	flow.deleteFolder('main', '20260101120002_main');

	const message =
		`Cannot rebuild snapshot 20260101120003_main: snapshot ${missing} is missing from the migrations folder. `
		+ 'Restore the missing migration folder from git, '
		+ 'or delete 20260101120003_main and every later migration, then run generate again.';
	await expect(flow.check('main')).rejects.toThrow(message);
	await expect(flow.generate('main', v3)).rejects.toThrow(message);
	await expect(flow.up('main')).rejects.toThrow(message);
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
	expect(() => flow.state('main', '20260101120003_main')).toThrow(
		`Cannot rebuild snapshot ${leaf}: snapshot ${missing} is missing from the migrations folder. `
			+ 'Restore the missing migration folder from git, '
			+ `or delete ${leaf} and every later migration, then run generate again.`,
	);
});

test('deleting the first migration stops every command because the base is missing', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);
	await flow.generate('main', v2);
	flow.deleteFolder('main', '20260101120001_main');

	const message = 'Cannot rebuild snapshot 20260101120002_main: its history does not reach a base snapshot. '
		+ 'Restore the first migration folder from git, '
		+ 'or delete 20260101120002_main and every later migration, then run generate again.';
	await expect(flow.check('main')).rejects.toThrow(message);
	await expect(flow.generate('main', v3)).rejects.toThrow(message);
	expect(flow.folders('main')).toStrictEqual(['20260101120002_main']);
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
			kind: 'malformed',
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
	expect(flow.snapshot('main', folder!).prevIds).toStrictEqual([flow.snapshot('main', '20260101120002_main').id]);
	expect(flow.sql('main', folder!)).toBe('ALTER TABLE "users" ADD COLUMN "name" text;');
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(redo));
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
	expect(flow.snapshot('main', folder!).prevIds).toStrictEqual([flow.snapshot('main', '20260101120001_main').id]);
	expect(flow.sql('main', folder!)).toBe('ALTER TABLE "users" ADD COLUMN "name" text;');
	expect(flow.state('main', folder!)).toStrictEqual(schemaState(redo));
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
	const flow = createFolderFlow();
	const users = pgTable('users', { id: integer() });
	const likes = pgTable('likes', { id: integer() });
	const groups = pgTable('groups', { id: integer() });
	await flow.generate('main', { users });
	flow.branch('a', 'main');
	flow.branch('b', 'main');
	await flow.generate('a', { users, likes });
	await flow.generate('b', { users, groups }, { at: new Date(Date.UTC(2026, 0, 1, 13, 0, 0)) });
	flow.merge('main', 'a', 'b');
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

test('up reads a healthy folder at an absolute path', async () => {
	const flow = createFolderFlow();
	await flow.generate('main', v1);

	expect(await flow.up('main')).toStrictEqual([]);
});

test('reconstruct stops on a cycle of first parents', () => {
	const diff = (id: string, parent: string): PostgresSnapshot => ({
		type: 'diff',
		version: '9',
		dialect: 'postgres',
		id,
		prevIds: [parent],
		deltas: [],
	});
	const history = new Map([diff('a', 'b'), diff('b', 'a')].map((it) => [it.id, it]));

	expect(() => reconstruct(history, 'a')).toThrow(
		'Cannot rebuild snapshot a: its history does not reach a base snapshot. '
			+ 'Restore the first migration folder from git, or delete a and every later migration, then run generate again.',
	);
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
