import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { embeddedMigrations, writeResult } from 'src/cli/commands/generate-common';

// Minimal snapshot stub accepted by writeResult
const minimalSnapshot: any = {
	version: '8',
	dialect: 'sqlite',
	id: 'test-id',
	prevIds: [],
	ddl: [],
	renames: [],
};

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drizzle-down-sql-test-'));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeResult — down SQL file generation', () => {
	test('writes down.sql file when downSqlStatements are provided', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: ['CREATE TABLE users (id INTEGER PRIMARY KEY)'],
			downSqlStatements: ['DROP TABLE users'],
			outFolder: tmpDir,
			breakpoints: true,
			name: 'create_users',
			renames: [],
			snapshots: [],
		});

		// Find the generated migration folder
		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		expect(dirs).toHaveLength(1);
		const tag = dirs[0]!;

		expect(fs.existsSync(path.join(tmpDir, tag, 'migration.sql'))).toBe(true);
		expect(fs.existsSync(path.join(tmpDir, tag, 'down.sql'))).toBe(true);

		const downContent = fs.readFileSync(path.join(tmpDir, tag, 'down.sql'), 'utf8');
		expect(downContent).toContain('DROP TABLE users');
	});

	test('does NOT write down.sql file when downSqlStatements is undefined', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: ['CREATE TABLE users (id INTEGER PRIMARY KEY)'],
			outFolder: tmpDir,
			breakpoints: true,
			name: 'test_migration',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		expect(dirs).toHaveLength(1);
		const tag = dirs[0]!;

		expect(fs.existsSync(path.join(tmpDir, tag, 'migration.sql'))).toBe(true);
		expect(fs.existsSync(path.join(tmpDir, tag, 'down.sql'))).toBe(false);
	});

	test('does NOT write down.sql when downSqlStatements is empty array', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: ['CREATE TABLE t (id INTEGER)'],
			downSqlStatements: [],
			outFolder: tmpDir,
			breakpoints: true,
			name: 'test_migration',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		expect(dirs).toHaveLength(1);
		const tag = dirs[0]!;

		expect(fs.existsSync(path.join(tmpDir, tag, 'down.sql'))).toBe(false);
	});

	test('respects breakpoints delimiter in down.sql', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: ['CREATE TABLE a (id INTEGER)', 'CREATE TABLE b (id INTEGER)'],
			downSqlStatements: ['DROP TABLE b', 'DROP TABLE a'],
			outFolder: tmpDir,
			breakpoints: true,
			name: 'test_migration',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		const tag = dirs[0]!;
		const downContent = fs.readFileSync(path.join(tmpDir, tag, 'down.sql'), 'utf8');
		expect(downContent).toContain('--> statement-breakpoint');
	});
});

describe('embeddedMigrations — down SQL bundling', () => {
	test('includes downMigrations block when down.sql files exist', () => {
		// Create a fake migration folder with both migration.sql and down.sql
		const migrationDir = path.join(tmpDir, '20240101120000_test');
		fs.mkdirSync(migrationDir, { recursive: true });
		fs.writeFileSync(path.join(migrationDir, 'migration.sql'), 'CREATE TABLE t (id INTEGER)');
		fs.writeFileSync(path.join(migrationDir, 'snapshot.json'), '{}');
		fs.writeFileSync(path.join(migrationDir, 'down.sql'), 'DROP TABLE t');

		const snapshots = [path.join(migrationDir, 'snapshot.json')];
		const output = embeddedMigrations(snapshots);

		expect(output).toContain("import m0000 from './20240101120000_test/migration.sql'");
		expect(output).toContain("import d0000 from './20240101120000_test/down.sql'");
		expect(output).toContain('downMigrations');
	});

	test('omits downMigrations block when no down.sql files exist', () => {
		const migrationDir = path.join(tmpDir, '20240101120000_test');
		fs.mkdirSync(migrationDir, { recursive: true });
		fs.writeFileSync(path.join(migrationDir, 'migration.sql'), 'CREATE TABLE t (id INTEGER)');
		fs.writeFileSync(path.join(migrationDir, 'snapshot.json'), '{}');

		const snapshots = [path.join(migrationDir, 'snapshot.json')];
		const output = embeddedMigrations(snapshots);

		expect(output).not.toContain('downMigrations');
		expect(output).not.toContain('down.sql');
	});

	test('only imports down SQL for entries that have down.sql', () => {
		// Create two migration folders, only one with down.sql
		const dir1 = path.join(tmpDir, '20240101120000_no_down');
		const dir2 = path.join(tmpDir, '20240102120000_has_down');
		fs.mkdirSync(dir1, { recursive: true });
		fs.mkdirSync(dir2, { recursive: true });

		fs.writeFileSync(path.join(dir1, 'migration.sql'), 'CREATE TABLE a (id INTEGER)');
		fs.writeFileSync(path.join(dir1, 'snapshot.json'), '{}');
		fs.writeFileSync(path.join(dir2, 'migration.sql'), 'CREATE TABLE b (id INTEGER)');
		fs.writeFileSync(path.join(dir2, 'snapshot.json'), '{}');
		fs.writeFileSync(path.join(dir2, 'down.sql'), 'DROP TABLE b');

		const snapshots = [
			path.join(dir1, 'snapshot.json'),
			path.join(dir2, 'snapshot.json'),
		];
		const output = embeddedMigrations(snapshots);

		expect(output).toContain("import d0001 from './20240102120000_has_down/down.sql'");
		expect(output).not.toContain("import d0000 from './20240101120000_no_down/down.sql'");
		expect(output).toContain('downMigrations');
	});

	test('adds expo header for expo driver', () => {
		const output = embeddedMigrations([], 'expo');
		expect(output).toContain('Expo/React Native');
	});
});
