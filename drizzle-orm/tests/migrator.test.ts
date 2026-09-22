import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'vitest';
import { readMigrationFiles } from '~/migrator.ts';

let tmpFolder: string;

function writeJournal(entries: { idx: number; when: number; tag: string; breakpoints: boolean }[]) {
	fs.mkdirSync(path.join(tmpFolder, 'meta'), { recursive: true });
	fs.writeFileSync(
		path.join(tmpFolder, 'meta', '_journal.json'),
		JSON.stringify({ entries }, null, 2),
	);
}

function writeMigration(tag: string, sql: string) {
	fs.writeFileSync(path.join(tmpFolder, `${tag}.sql`), sql);
}

beforeEach(() => {
	tmpFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'drizzle-migrator-'));
});

afterEach(() => {
	fs.rmSync(tmpFolder, { recursive: true, force: true });
});

describe('readMigrationFiles', () => {
	test('skips fully commented introspect file produced by drizzle-kit pull', ({ expect }) => {
		const introspectSql = `-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "users" (
\t"id" serial PRIMARY KEY NOT NULL,
\t"name" text NOT NULL
);
*/`;

		writeJournal([{ idx: 0, when: 1700000000000, tag: '0000_pull', breakpoints: true }]);
		writeMigration('0000_pull', introspectSql);

		const migrations = readMigrationFiles({ migrationsFolder: tmpFolder });

		expect(migrations).toHaveLength(1);
		expect(migrations[0]!.sql).toEqual([]);
		expect(migrations[0]!.folderMillis).toBe(1700000000000);
		expect(typeof migrations[0]!.hash).toBe('string');
	});

	test('splits a normal multi-statement migration on the breakpoint marker', ({ expect }) => {
		const sql = `CREATE TABLE "a" ("id" serial PRIMARY KEY);
--> statement-breakpoint
CREATE TABLE "b" ("id" serial PRIMARY KEY);`;

		writeJournal([{ idx: 0, when: 1700000000001, tag: '0000_init', breakpoints: true }]);
		writeMigration('0000_init', sql);

		const migrations = readMigrationFiles({ migrationsFolder: tmpFolder });

		expect(migrations).toHaveLength(1);
		expect(migrations[0]!.sql).toHaveLength(2);
		expect(migrations[0]!.sql[0]).toContain('CREATE TABLE "a"');
		expect(migrations[0]!.sql[1]).toContain('CREATE TABLE "b"');
	});

	test('still executes an uncommented introspect file', ({ expect }) => {
		const sql = `-- Current sql file was generated after introspecting the database
CREATE TABLE "users" (
\t"id" serial PRIMARY KEY NOT NULL
);`;

		writeJournal([{ idx: 0, when: 1700000000002, tag: '0000_uncommented', breakpoints: true }]);
		writeMigration('0000_uncommented', sql);

		const migrations = readMigrationFiles({ migrationsFolder: tmpFolder });

		expect(migrations).toHaveLength(1);
		expect(migrations[0]!.sql).toHaveLength(1);
		expect(migrations[0]!.sql[0]).toContain('CREATE TABLE "users"');
	});

	test('does not skip a file that has SQL after the trailing block comment', ({ expect }) => {
		const sql = `/*
ignored
*/
CREATE TABLE "after" ("id" serial PRIMARY KEY);`;

		writeJournal([{ idx: 0, when: 1700000000003, tag: '0000_mixed', breakpoints: true }]);
		writeMigration('0000_mixed', sql);

		const migrations = readMigrationFiles({ migrationsFolder: tmpFolder });

		expect(migrations).toHaveLength(1);
		expect(migrations[0]!.sql).toHaveLength(1);
		expect(migrations[0]!.sql[0]).toContain('CREATE TABLE "after"');
	});
});
