import { index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	CUSTOM_DOWN_SQL_SCAFFOLD,
	DOWN_SQL_HEADER,
	embeddedMigrations,
	writeResult,
} from 'src/cli/commands/generate-common';
import { ddlDiffWithDown } from 'src/cli/commands/generate-postgres';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { fromDrizzleSchema, fromExports } from 'src/dialects/postgres/drizzle';
import { mockResolver } from 'src/utils/mocks';
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

const postgresDown = async (from: Record<string, unknown>, to: Record<string, unknown>) => {
	const ddl = (s: Record<string, unknown>) => interimToDDL(fromDrizzleSchema(fromExports(s), () => true).schema).ddl;
	const up = await ddlDiffWithDown(ddl(from), ddl(to), () => mockResolver(new Set()));
	const { sqlStatements, groupedStatements } = await up.down();
	return { up: up.sqlStatements, down: { sqlStatements, statements: groupedStatements } };
};

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

	test('emits a review banner when the rollback recreates dropped objects', async () => {
		const posts = pgTable('posts', { id: integer() });
		const { up, down } = await postgresDown(
			{ users: pgTable('users', { id: integer() }), posts: pgTable('posts', { id: integer(), body: text() }) },
			{ posts },
		);
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: up,
			down,
			outFolder: tmpDir,
			breakpoints: true,
			generateDownMigrations: true,
			name: 'lossy',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		const downContent = readDownBody(dirs[0]!);
		expect(downContent.startsWith(DOWN_SQL_HEADER)).toBe(true);
		const lines = downContent.split('\n');
		const firstSqlLine = lines.findIndex((l) => !l.startsWith('--'));
		const banner = lines.slice(0, firstSqlLine).join('\n');
		expect(banner).toContain('⚠ REVIEW: best-effort checks flagged operations in this rollback.');
		expect(banner).toContain('recreates a table the migration dropped');
		expect(banner).toContain('re-adds a column the migration dropped');
		expect(lines[firstSqlLine]!.startsWith('CREATE TABLE "users"')).toBe(true);
	});

	test('prints rollback review warnings to the console', async () => {
		const { up, down } = await postgresDown(
			{ posts: pgTable('posts', { id: integer(), body: text().notNull() }) },
			{ posts: pgTable('posts', { id: integer() }) },
		);
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		let printed: string;
		try {
			writeResult({
				snapshot: { ...minimalSnapshot },
				sqlStatements: up,
				down,
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

		expect(printed).toContain('down.sql needs review; best-effort checks flagged:');
		expect(printed).toContain('These operations cannot bring back data the migration dropped:');
		expect(printed).toContain('These operations may fail on a populated table:');
		expect(printed).toContain('ALTER TABLE "posts" ADD COLUMN "body" text NOT NULL; — re-adds a NOT NULL column');
	});

	test('omits the banner when the rollback only undoes creates', async () => {
		const { up, down } = await postgresDown({}, {
			users: pgTable('users', { id: integer(), name: text() }, (t) => [index('users_name_idx').on(t.name)]),
		});
		writeResult({
			snapshot: { ...minimalSnapshot },
			sqlStatements: up,
			down,
			outFolder: tmpDir,
			breakpoints: false,
			generateDownMigrations: true,
			name: 'reversible',
			renames: [],
			snapshots: [],
		});

		const dirs = fs.readdirSync(tmpDir).filter((d) => fs.statSync(path.join(tmpDir, d)).isDirectory());
		expect(readDownBody(dirs[0]!)).toBe(`${DOWN_SQL_HEADER}\n${down.sqlStatements.join('\n')}`);
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
