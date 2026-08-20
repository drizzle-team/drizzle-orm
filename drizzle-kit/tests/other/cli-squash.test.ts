import { test as brotest } from '@drizzle-team/brocli';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, assert, expect, test } from 'vitest';
import { squashHandler } from '../../src/cli/commands/squash';
import { squash } from '../../src/cli/schema';
import { wrapParam } from '../../src/cli/validations/common';
import { error } from '../../src/cli/views';
import { ORIGIN } from './check-fixtures';
import { createConfig } from './utils';

const originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
process.env.TEST_CONFIG_PATH_PREFIX = './tests/cli/';
afterEach(() => {
	process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix ?? './tests/cli/';
});

const stageOut = (): string => {
	mkdirSync('tests/tmp', { recursive: true });
	return mkdtempSync('tests/tmp/cli-squash-');
};

const writeMigration = (
	out: string,
	folder: string,
	id: string,
	prevIds: string[],
	sql: string,
) => {
	const path = join(out, folder);
	mkdirSync(path, { recursive: true });
	writeFileSync(
		join(path, 'snapshot.json'),
		JSON.stringify({ version: '8', dialect: 'postgres', id, prevIds, ddl: [], renames: [] }, null, 2),
	);
	writeFileSync(join(path, 'migration.sql'), sql);
};

const stageChain = (count: number): string => {
	const out = stageOut();
	let prev = ORIGIN;
	for (let i = 0; i < count; i++) {
		const id = `s${i}`;
		writeMigration(out, `${String(i).padStart(4, '0')}_migration_${i}`, id, [prev], `SELECT ${i};`);
		prev = id;
	}
	return out;
};

// #region CLI option parsing

test('validate config #1: cli params', async () => {
	const res = await brotest(squash, `--dialect=postgresql --out=test --start=1 --end=2`);

	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		out: 'test',
		start: 1,
		end: 2,
	});
});

test('validate config #2: config file', async () => {
	const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';
	const { path, name } = createConfig({ dialect: 'postgresql', out: 'test' }, prefix);

	const res = await brotest(squash, `--config=${name} --start=0 --end=1`);

	unlinkSync(path);

	assert.equal(res.type, 'handler');
	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		out: 'test',
		start: 0,
		end: 1,
	});
});

test('validate config #3: missing dialect', async () => {
	const res = await brotest(squash, `--out=test --start=0 --end=1`);

	expect(res.type).toBe('error');
	if (res.type !== 'error') return;
	expect((res.error as Error).message).toBe(
		[error('Please provide required params:'), wrapParam('dialect', undefined)].join('\n'),
	);
});

test('validate config #4: start and end are required', async () => {
	const res = await brotest(squash, `--dialect=postgresql`);

	expect(res.type).toBe('error');
});

// #endregion

// #region integration

test('squash integration: combines a range of migrations', () => {
	const out = stageChain(4);

	const result = squashHandler({ out, dialect: 'postgresql', start: 1, end: 2 });

	assert.equal(result.status, 'ok');
	if (result.status !== 'ok') return;

	// one squashed folder replaced two original ones
	const remaining = readdirSync(out).sort();
	expect(remaining).toStrictEqual(['0000_migration_0', '0001_migration_1', '0003_migration_3']);

	// squashed folder keeps the first folder name and holds the combined sql
	const sql = readFileSync(join(out, '0001_migration_1', 'migration.sql'), 'utf-8');
	expect(sql).toContain('-- Start migration 0001_migration_1');
	expect(sql).toContain('SELECT 1;');
	expect(sql).toContain('-- Start migration 0002_migration_2');
	expect(sql).toContain('SELECT 2;');

	// snapshot keeps the id of the last squashed migration and prevIds of the first one
	const snapshot = JSON.parse(readFileSync(join(out, '0001_migration_1', 'snapshot.json'), 'utf-8'));
	expect(snapshot.id).toBe('s2');
	expect(snapshot.prevIds).toStrictEqual(['s0']);

	// the migration after the range still points to the last squashed snapshot id
	const after = JSON.parse(readFileSync(join(out, '0003_migration_3', 'snapshot.json'), 'utf-8'));
	expect(after.prevIds).toStrictEqual(['s2']);
});

test('squash integration: full range', () => {
	const out = stageChain(3);

	const result = squashHandler({ out, dialect: 'postgresql', start: 0, end: 2 });

	assert.equal(result.status, 'ok');
	if (result.status !== 'ok') return;

	const remaining = readdirSync(out).sort();
	expect(remaining).toStrictEqual(['0000_migration_0']);

	const snapshot = JSON.parse(readFileSync(join(out, '0000_migration_0', 'snapshot.json'), 'utf-8'));
	expect(snapshot.id).toBe('s2');
	expect(snapshot.prevIds).toStrictEqual([ORIGIN]);
});

test('squash integration: single migration range is a no-op', () => {
	const out = stageChain(3);

	const result = squashHandler({ out, dialect: 'postgresql', start: 1, end: 1 });

	assert.equal(result.status, 'no_changes');
	expect(readdirSync(out).sort()).toStrictEqual([
		'0000_migration_0',
		'0001_migration_1',
		'0002_migration_2',
	]);
});

test('squash integration: invalid range', () => {
	const out = stageChain(3);

	expect(() => squashHandler({ out, dialect: 'postgresql', start: 2, end: 1 })).toThrowError();
	expect(() => squashHandler({ out, dialect: 'postgresql', start: 0, end: 3 })).toThrowError();
});

test('squash integration: empty folder', () => {
	const out = stageOut();

	expect(() => squashHandler({ out, dialect: 'postgresql', start: 0, end: 1 })).toThrowError(
		/No migrations were found/,
	);
});

test('squash integration: v1 folder with journal is rejected', () => {
	const out = stageOut();
	mkdirSync(join(out, 'meta'), { recursive: true });
	writeFileSync(join(out, 'meta', '_journal.json'), '{}');

	expect(() => squashHandler({ out, dialect: 'postgresql', start: 0, end: 1 })).toThrowError(
		/migrations folder format is outdated/,
	);
});

test('squash integration: missing migration.sql is rejected', () => {
	const out = stageOut();
	const folder = join(out, '0000_migration_0');
	mkdirSync(folder, { recursive: true });
	writeFileSync(
		join(folder, 'snapshot.json'),
		JSON.stringify({ version: '8', dialect: 'postgres', id: 's0', prevIds: [ORIGIN], ddl: [] }),
	);

	expect(() => squashHandler({ out, dialect: 'postgresql', start: 0, end: 1 })).toThrowError(
		/No migration.sql file was found/,
	);
});

// #endregion

// #region branch guards

test('squash rejects a branch off the middle of the range', () => {
	const out = stageOut();
	writeMigration(out, '0000_a', 's0', [ORIGIN], 'SELECT 0;');
	writeMigration(out, '0001_b', 's1', ['s0'], 'SELECT 1;');
	writeMigration(out, '0002_c', 's2', ['s0'], 'SELECT 2;'); // branches off s0

	expect(() => squashHandler({ out, dialect: 'postgresql', start: 0, end: 1 })).toThrowError(
		/branches off the middle of the squashed range/,
	);
});

test('squash rejects a merge into the middle of the range', () => {
	const out = stageOut();
	writeMigration(out, '0000_a', 's0', [ORIGIN], 'SELECT 0;');
	writeMigration(out, '0001_b', 's1', ['s0', ORIGIN], 'SELECT 1;'); // merges ORIGIN into s1

	expect(() => squashHandler({ out, dialect: 'postgresql', start: 0, end: 1 })).toThrowError(
		/has a parent outside of the squashed range/,
	);
});

// #endregion

// #region post-squash compatibility

test('post-squash: orm migrator can still read the migrations folder', () => {
	const out = stageChain(3);

	squashHandler({ out, dialect: 'postgresql', start: 0, end: 2 });

	const migrations = readMigrationFiles({ migrationsFolder: out });
	expect(migrations).toHaveLength(1);
	expect(migrations[0]!.sql.join('')).toContain('SELECT 0;');
	expect(migrations[0]!.sql.join('')).toContain('SELECT 2;');
});

test('post-squash: migrations.js bundle is regenerated', () => {
	const out = stageChain(3);
	writeFileSync(
		join(out, 'migrations.js'),
		'// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo\n',
	);

	squashHandler({ out, dialect: 'postgresql', start: 0, end: 2 });

	const bundle = readFileSync(join(out, 'migrations.js'), 'utf-8');
	expect(bundle).toContain("import m0000 from './0000_migration_0/migration.sql';");
	expect(bundle).not.toContain('0001_migration_1');
	expect(bundle).toContain('Expo/React Native');
});

// #endregion
