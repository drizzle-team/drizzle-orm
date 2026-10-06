import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	CUSTOM_DOWN_SQL_SCAFFOLD,
	DOWN_SQL_HEADER,
	embeddedMigrations,
	writeResult,
} from 'src/cli/commands/generate-common';
import type { DownStatement } from 'src/cli/commands/generate-down-helpers';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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

const readDownBody = (tag: string) => {
	const [stamp, ...body] = fs.readFileSync(path.join(tmpDir, tag, 'down.sql'), 'utf8').split('\n');
	expect(stamp).toMatch(/^-- drizzle:up-hash=[0-9a-f]{64}$/);
	return body.join('\n');
};

describe('writeResult — down SQL file generation', () => {
	test('writes down.sql file when downSqlStatements are provided', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: ['CREATE TABLE users (id INTEGER PRIMARY KEY)'],
			down: { sqlStatements: ['DROP TABLE users'], statements: [] },
			outFolder: tmpDir,
			breakpoints: true,
			generateDownMigrations: true,
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

		const downContent = readDownBody(tag);
		expect(downContent).toContain('DROP TABLE users');
	});

	test('does NOT write down.sql file when downSqlStatements is undefined', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: ['CREATE TABLE users (id INTEGER PRIMARY KEY)'],
			outFolder: tmpDir,
			breakpoints: true,
			generateDownMigrations: true,
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
			down: { sqlStatements: [], statements: [] },
			outFolder: tmpDir,
			breakpoints: true,
			generateDownMigrations: true,
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
			down: { sqlStatements: ['DROP TABLE b', 'DROP TABLE a'], statements: [] },
			outFolder: tmpDir,
			breakpoints: true,
			generateDownMigrations: true,
			name: 'test_migration',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		const tag = dirs[0]!;
		const downContent = readDownBody(tag);
		expect(downContent.startsWith(DOWN_SQL_HEADER)).toBe(true);
		expect(downContent).toContain('--> statement-breakpoint');
		// After the header, exactly one breakpoint between two statements
		const body = downContent.slice(DOWN_SQL_HEADER.length + 1);
		const parts = body.split('--> statement-breakpoint\n');
		expect(parts).toHaveLength(2);
		expect(parts[0]!.trim()).toBe('DROP TABLE b');
		expect(parts[1]!.trim()).toBe('DROP TABLE a');
	});

	test('uses newline delimiter when breakpoints is false', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: ['CREATE TABLE a (id INTEGER)', 'CREATE TABLE b (id INTEGER)'],
			down: { sqlStatements: ['DROP TABLE b', 'DROP TABLE a'], statements: [] },
			outFolder: tmpDir,
			breakpoints: false,
			generateDownMigrations: true,
			name: 'test_migration',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		const tag = dirs[0]!;
		const downContent = readDownBody(tag);
		expect(downContent).not.toContain('--> statement-breakpoint');
		expect(downContent).toBe(`${DOWN_SQL_HEADER}\nDROP TABLE b\nDROP TABLE a`);
	});

	test('prepends editable header to generated down.sql', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: ['CREATE TABLE users (id INTEGER PRIMARY KEY)'],
			down: { sqlStatements: ['DROP TABLE users'], statements: [] },
			outFolder: tmpDir,
			breakpoints: true,
			generateDownMigrations: true,
			name: 'with_header',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		const tag = dirs[0]!;
		const downContent = readDownBody(tag);
		expect(downContent.startsWith(DOWN_SQL_HEADER)).toBe(true);
		expect(downContent).toContain('reverses structural (DDL) changes only');
	});

	test('writes scaffold down.sql for custom migrations', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: [],
			outFolder: tmpDir,
			breakpoints: true,
			generateDownMigrations: true,
			name: 'custom_migration',
			type: 'custom',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		const tag = dirs[0]!;
		expect(fs.existsSync(path.join(tmpDir, tag, 'down.sql'))).toBe(true);
		expect(fs.readFileSync(path.join(tmpDir, tag, 'down.sql'), 'utf8')).toBe(CUSTOM_DOWN_SQL_SCAFFOLD);
	});

	test('emits an irreversible-operation banner when down statements lose data', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: ['CREATE TABLE users (id INTEGER PRIMARY KEY)', 'ALTER TABLE posts DROP COLUMN body'],
			down: {
				sqlStatements: ['DROP TABLE users', 'ALTER TABLE posts ADD COLUMN body text'],
				statements: [
					{ jsonStatement: { type: 'drop_table' }, sqlStatements: ['DROP TABLE users'] },
					{ jsonStatement: { type: 'add_column' }, sqlStatements: ['ALTER TABLE posts ADD COLUMN body text'] },
				],
			},
			outFolder: tmpDir,
			breakpoints: true,
			generateDownMigrations: true,
			name: 'lossy',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		const tag = dirs[0]!;
		const downContent = readDownBody(tag);
		expect(downContent).toContain('⚠ REVIEW');
		expect(downContent).toContain('DROP TABLE users — drops a table the migration created');
		expect(downContent).toContain('re-adds a column the migration dropped');
		// The header + banner are leading comment lines; the rollback SQL follows.
		expect(downContent.startsWith(DOWN_SQL_HEADER)).toBe(true);
		const lines = downContent.split('\n');
		const firstSqlLine = lines.findIndex((l) => !l.startsWith('--'));
		expect(lines.slice(0, firstSqlLine).join('\n')).toContain('⚠ REVIEW');
		expect(lines[firstSqlLine]!.startsWith('DROP TABLE users')).toBe(true);
	});

	test('prints irreversible-operation warnings to the console', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		let printed: string;
		try {
			writeResult({
				snapshot: { ...minimalSnapshot },
				sqlStatements: ['ALTER TABLE posts DROP COLUMN body'],
				down: {
					sqlStatements: ['ALTER TABLE posts ADD COLUMN body text NOT NULL'],
					statements: [
						{
							jsonStatement: {
								type: 'add_column',
								column: { notNull: true, default: null },
							} as DownStatement['jsonStatement'],
							sqlStatements: ['ALTER TABLE posts ADD COLUMN body text NOT NULL'],
						},
					],
				},
				outFolder: tmpDir,
				breakpoints: true,
				generateDownMigrations: true,
				name: 'lossy_console',
				renames: [],
				snapshots: [],
			});
			printed = log.mock.calls.map((args) => args.join(' ')).join('\n');
		} finally {
			log.mockRestore();
		}

		expect(printed).toContain('down.sql cannot fully restore the previous database state');
		expect(printed).toContain('These operations lose data:');
		expect(printed).toContain('These operations may fail on a populated table:');
		expect(printed).toContain('ALTER TABLE posts ADD COLUMN body text NOT NULL — re-adds a NOT NULL column');
	});

	test('omits the banner when down statements are fully reversible', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: ['CREATE INDEX idx ON users (id)'],
			down: {
				sqlStatements: ['DROP INDEX idx'],
				statements: [
					{ jsonStatement: { type: 'drop_index' }, sqlStatements: ['DROP INDEX idx'] },
				],
			},
			outFolder: tmpDir,
			breakpoints: true,
			generateDownMigrations: true,
			name: 'reversible',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		const tag = dirs[0]!;
		const downContent = readDownBody(tag);
		expect(downContent).not.toContain('⚠ REVIEW');
		expect(downContent).toBe(`${DOWN_SQL_HEADER}\nDROP INDEX idx`);
	});

	test('skips down.sql entirely when generateDownMigrations is false', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: ['CREATE TABLE users (id INTEGER PRIMARY KEY)'],
			down: { sqlStatements: ['DROP TABLE users'], statements: [] },
			outFolder: tmpDir,
			breakpoints: true,
			generateDownMigrations: false,
			name: 'opt_out',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		const tag = dirs[0]!;
		expect(fs.existsSync(path.join(tmpDir, tag, 'migration.sql'))).toBe(true);
		expect(fs.existsSync(path.join(tmpDir, tag, 'down.sql'))).toBe(false);
	});

	test('skips custom scaffold when generateDownMigrations is false', () => {
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: [],
			outFolder: tmpDir,
			breakpoints: true,
			generateDownMigrations: false,
			name: 'custom_opt_out',
			type: 'custom',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		const tag = dirs[0]!;
		expect(fs.existsSync(path.join(tmpDir, tag, 'down.sql'))).toBe(false);
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

	test('keys migrations and downMigrations by the same folder tag', () => {
		const withoutDown = path.join(tmpDir, '20240101120000_no_down');
		const withDown = path.join(tmpDir, '20240102120000_has_down');
		for (const dir of [withoutDown, withDown]) {
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(path.join(dir, 'migration.sql'), 'SELECT 1');
			fs.writeFileSync(path.join(dir, 'snapshot.json'), '{}');
		}
		fs.writeFileSync(path.join(withDown, 'down.sql'), 'SELECT 1');

		const output = embeddedMigrations(
			[path.join(withoutDown, 'snapshot.json'), path.join(withDown, 'snapshot.json')],
			'durable-sqlite',
		);

		expect(output).toBe(
			"import m0000 from './20240101120000_no_down/migration.sql';\n"
				+ "import m0001 from './20240102120000_has_down/migration.sql';\n"
				+ "import d0001 from './20240102120000_has_down/down.sql';\n"
				+ `
  export default {
    migrations: {
      "20240101120000_no_down": m0000,
      "20240102120000_has_down": m0001
    },
    downMigrations: {
      "20240102120000_has_down": d0001
    }
  }
  `,
		);
	});

	test('adds expo header for expo driver', () => {
		const output = embeddedMigrations([], 'expo');
		expect(output).toContain('Expo/React Native');
	});
});
