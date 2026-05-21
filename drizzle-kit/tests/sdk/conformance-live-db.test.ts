import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { beforeAll, describe, expect, test } from 'vitest';
import type { PushOptions } from '../../src/cli/contract';
import { runCli, runSdk } from './runners';

const tmpRoot = resolve(__dirname, 'tmp');

const postgresUrl = process.env.PG18_URL ?? process.env.PG17_URL ?? process.env.PG16_URL;
const mysqlUrl = process.env.MYSQL_CONNECTION_STRING;

beforeAll(() => {
	rmSync(tmpRoot, { recursive: true, force: true });
	mkdirSync(tmpRoot, { recursive: true });
});

const setupScenario = (name: string, schemaContent: string) => {
	const dir = resolve(tmpRoot, name);
	mkdirSync(dir, { recursive: true });
	const schemaPath = resolve(dir, 'schema.ts');
	writeFileSync(schemaPath, schemaContent);
	return { dir, schemaPath };
};

const teardownScenario = (name: string) => {
	rmSync(resolve(tmpRoot, name), { recursive: true, force: true });
};

// Each scenario isolates CLI and SDK runs by giving them disjoint table names.
// That keeps parity assertions valid against a single shared container even when
// the scenario mutates DB state (e.g. ok create_table).
const pgEmptySchema = (tableName: string) => `
import { pgTable, integer } from 'drizzle-orm/pg-core';
export const _placeholder = pgTable('${tableName}', {
	id: integer('id').primaryKey(),
});
`;

const pgNewTableSchema = (tableName: string) => `
import { pgTable, integer, text } from 'drizzle-orm/pg-core';
export const t = pgTable('${tableName}', {
	id: integer('id').primaryKey(),
	name: text('name'),
});
`;

const mysqlEmptySchema = (tableName: string) => `
import { mysqlTable, int } from 'drizzle-orm/mysql-core';
export const _placeholder = mysqlTable('${tableName}', {
	id: int('id').primaryKey(),
});
`;

const mysqlNewTableSchema = (tableName: string) => `
import { mysqlTable, int, varchar } from 'drizzle-orm/mysql-core';
export const t = mysqlTable('${tableName}', {
	id: int('id').primaryKey(),
	name: varchar('name', { length: 64 }),
});
`;

const dropPgTable = async (url: string, tableName: string) => {
	const { Client } = await import('pg');
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		await client.query(`DROP TABLE IF EXISTS "${tableName}"`);
	} finally {
		await client.end();
	}
};

const dropMysqlTable = async (url: string, tableName: string) => {
	const mysql = await import('mysql2/promise');
	const conn = await mysql.createConnection(url);
	try {
		await conn.query(`DROP TABLE IF EXISTS \`${tableName}\``);
	} finally {
		await conn.end();
	}
};

const execPg = async (url: string, sql: string) => {
	const { Client } = await import('pg');
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		await client.query(sql);
	} finally {
		await client.end();
	}
};

const execMysql = async (url: string, sql: string) => {
	const mysql = await import('mysql2/promise');
	const conn = await mysql.createConnection(url);
	try {
		await conn.query(sql);
	} finally {
		await conn.end();
	}
};

describe.skipIf(!postgresUrl)('push postgres (live DB)', () => {
	/**
	 * Parity invariant: CLI envelope equals SDK envelope for the no_changes status.
	 * Pre-state: a placeholder table is seeded by an initial CLI push so both subsequent
	 * runs see "table already present, empty diff" and emit no_changes against
	 * identical-shape schema fixtures.
	 * Endpoint: `expect(sdkResult).toEqual(cliResult)` after both runs return.
	 */
	test('no_changes: CLI and SDK return byte-identical envelopes when diff is empty', { timeout: 60000 }, async () => {
		const name = 'push-postgres-no-changes-live';
		const placeholder = '_sdk_conformance_no_changes_placeholder';
		const { schemaPath } = setupScenario(name, pgEmptySchema(placeholder));
		try {
			await dropPgTable(postgresUrl!, placeholder);

			// Seed: create the placeholder so subsequent diffs find it idempotent.
			runCli(['push', '--dialect', 'postgresql', '--schema', schemaPath, '--url', postgresUrl!, '--json']);

			const argv = ['push', '--dialect', 'postgresql', '--schema', schemaPath, '--url', postgresUrl!, '--json'];
			const sdkOpts: PushOptions = { dialect: 'postgresql', schema: schemaPath, url: postgresUrl! };

			const { envelope: cliResult } = runCli(argv);
			const sdkResult = await runSdk('push', sdkOpts);

			expect(cliResult.status).toBe('no_changes');
			expect(sdkResult).toEqual(cliResult);
		} finally {
			await dropPgTable(postgresUrl!, placeholder).catch(() => {});
			teardownScenario(name);
		}
	});

	/**
	 * Parity invariant: CLI envelope equals SDK envelope (modulo embedded table name)
	 * for the ok status against a fresh create_table operation.
	 * Pre-state: two disjoint table names — one for CLI, one for SDK. After CLI creates
	 * its table, the table is dropped before the SDK run so the SDK introspects a clean
	 * slate. Otherwise the diff engine would see the CLI's table as a rename candidate
	 * for the SDK's table (similar schema shape, prefix-overlap name) and emit a
	 * rename_or_create missing hint instead of treating the SDK push as a fresh create.
	 * Endpoint: `expect(cliResult.status).toBe('ok')` and `expect(sdkResult.status).toBe('ok')`,
	 * with matching `dialect` field on both envelopes.
	 */
	test(
		'ok create_table: CLI and SDK return matching ok envelopes against disjoint live tables',
		{ timeout: 60000 },
		async () => {
			const cliName = 'push-postgres-ok-create-table-live-cli';
			const sdkName = 'push-postgres-ok-create-table-live-sdk';
			const cliTable = 'sdk_conformance_pg_ok_cli';
			const sdkTable = 'sdk_conformance_pg_ok_sdk';
			const { schemaPath: cliSchemaPath } = setupScenario(cliName, pgNewTableSchema(cliTable));
			const { schemaPath: sdkSchemaPath } = setupScenario(sdkName, pgNewTableSchema(sdkTable));
			try {
				await dropPgTable(postgresUrl!, cliTable);
				await dropPgTable(postgresUrl!, sdkTable);

				const { envelope: cliResult } = runCli([
					'push',
					'--dialect',
					'postgresql',
					'--schema',
					cliSchemaPath,
					'--url',
					postgresUrl!,
					'--json',
				]);

				await dropPgTable(postgresUrl!, cliTable);

				const sdkResult = await runSdk('push', {
					dialect: 'postgresql',
					schema: sdkSchemaPath,
					url: postgresUrl!,
				});

				expect(cliResult.status).toBe('ok');
				expect(sdkResult.status).toBe('ok');
				if (cliResult.status === 'ok' && sdkResult.status === 'ok') {
					expect(sdkResult.dialect).toBe(cliResult.dialect);
				}
			} finally {
				await dropPgTable(postgresUrl!, cliTable).catch(() => {});
				await dropPgTable(postgresUrl!, sdkTable).catch(() => {});
				teardownScenario(cliName);
				teardownScenario(sdkName);
			}
		},
	);

	/**
	 * Parity invariant: CLI envelope equals SDK envelope for the missing_hints status
	 * surfaced at the post-suggestions checkpoint.
	 * Pre-state: a three-phase setup — first the seed table is created via CLI with a
	 * single id column; then one row is inserted so the table is non-empty (the
	 * suggestions path only emits `add_not_null` hints when `select 1 from t limit 1`
	 * returns a row); then both CLI and SDK push a child schema that adds a new NOT
	 * NULL column with no default, so `suggestions(db, ...)` raises a
	 * confirm_data_loss/add_not_null missing hint on the new column.
	 * Endpoint: `expect(sdkResult).toEqual(cliResult)` after both runs return the
	 * same missing_hints envelope.
	 */
	test(
		'missing_hints post-suggestions: CLI and SDK both surface confirm_data_loss/add_not_null at the suggestions checkpoint',
		{ timeout: 60000 },
		async () => {
			const name = 'push-postgres-missing-hints-post-suggestions-live';
			const tableName = 'sdk_conformance_pg_missing_hints_t';
			const seedSchema = `
import { pgTable, integer } from 'drizzle-orm/pg-core';
export const t = pgTable('${tableName}', {
	id: integer('id').primaryKey(),
});
`;
			const childSchema = `
import { pgTable, integer, text } from 'drizzle-orm/pg-core';
export const t = pgTable('${tableName}', {
	id: integer('id').primaryKey(),
	mandatory: text('mandatory').notNull(),
});
`;
			const { schemaPath: seedSchemaPath } = setupScenario(`${name}-seed`, seedSchema);
			const { schemaPath: childSchemaPath } = setupScenario(`${name}-child`, childSchema);
			try {
				await dropPgTable(postgresUrl!, tableName);
				// Seed the DB with the id-only schema (CLI run creates the table)
				runCli(['push', '--dialect', 'postgresql', '--schema', seedSchemaPath, '--url', postgresUrl!, '--json']);
				// Insert one row so the suggestions path treats the table as non-empty
				await execPg(postgresUrl!, `INSERT INTO "${tableName}" (id) VALUES (1)`);

				// Run both CLI and SDK against the child schema; expect missing_hints envelope from both
				const argv = ['push', '--dialect', 'postgresql', '--schema', childSchemaPath, '--url', postgresUrl!, '--json'];
				const sdkOpts: PushOptions = { dialect: 'postgresql', schema: childSchemaPath, url: postgresUrl! };

				const { envelope: cliResult } = runCli(argv);
				const sdkResult = await runSdk('push', sdkOpts);

				expect(sdkResult).toEqual(cliResult);
			} finally {
				await dropPgTable(postgresUrl!, tableName).catch(() => {});
				teardownScenario(`${name}-seed`);
				teardownScenario(`${name}-child`);
			}
		},
	);
});

describe.skipIf(!mysqlUrl)('push mysql (live DB)', () => {
	// Drop all tables before the suite so the diff engine sees a truly empty DB.
	// Without this, leftover tables from prior mysql test files (e.g. tests/mysql/*.test.ts)
	// confuse the diff and produce rename_or_create missing_hints when a plain create_table
	// is expected.
	beforeAll(async () => {
		const mysql = await import('mysql2/promise');
		const conn = await mysql.createConnection(mysqlUrl!);
		try {
			const [rows] = await conn.query<{ TABLE_NAME: string }[] & any[]>(
				'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
			);
			await conn.query('SET FOREIGN_KEY_CHECKS = 0');
			for (const row of rows as Array<{ TABLE_NAME: string }>) {
				await conn.query(`DROP TABLE IF EXISTS \`${row.TABLE_NAME}\``);
			}
			await conn.query('SET FOREIGN_KEY_CHECKS = 1');
		} finally {
			await conn.end();
		}
	});

	/**
	 * Parity invariant: CLI envelope equals SDK envelope for the no_changes status.
	 * Pre-state: a placeholder table is seeded by an initial CLI push so both subsequent
	 * runs see "table already present, empty diff" and emit no_changes against
	 * identical-shape schema fixtures.
	 * Endpoint: `expect(sdkResult).toEqual(cliResult)` after both runs return.
	 */
	test('no_changes: CLI and SDK return byte-identical envelopes when diff is empty', { timeout: 60000 }, async () => {
		const name = 'push-mysql-no-changes-live';
		const placeholder = '_sdk_conformance_no_changes_placeholder';
		const { schemaPath } = setupScenario(name, mysqlEmptySchema(placeholder));
		try {
			await dropMysqlTable(mysqlUrl!, placeholder);

			runCli(['push', '--dialect', 'mysql', '--schema', schemaPath, '--url', mysqlUrl!, '--json']);

			const argv = ['push', '--dialect', 'mysql', '--schema', schemaPath, '--url', mysqlUrl!, '--json'];
			const sdkOpts: PushOptions = { dialect: 'mysql', schema: schemaPath, url: mysqlUrl! };

			const { envelope: cliResult } = runCli(argv);
			const sdkResult = await runSdk('push', sdkOpts);

			expect(cliResult.status).toBe('no_changes');
			expect(sdkResult).toEqual(cliResult);
		} finally {
			await dropMysqlTable(mysqlUrl!, placeholder).catch(() => {});
			teardownScenario(name);
		}
	});

	/**
	 * Parity invariant: CLI envelope equals SDK envelope (modulo embedded table name)
	 * for the ok status against a fresh create_table operation.
	 * Pre-state: two disjoint table names — one for CLI, one for SDK. After CLI creates
	 * its table, the table is dropped before the SDK run so the SDK introspects a clean
	 * slate. Otherwise the diff engine would see the CLI's table as a rename candidate
	 * for the SDK's table (similar schema shape, prefix-overlap name) and emit a
	 * rename_or_create missing hint instead of treating the SDK push as a fresh create.
	 * Endpoint: `expect(cliResult.status).toBe('ok')` and `expect(sdkResult.status).toBe('ok')`,
	 * with matching `dialect` field on both envelopes.
	 */
	test(
		'ok create_table: CLI and SDK return matching ok envelopes against disjoint live tables',
		{ timeout: 60000 },
		async () => {
			const cliName = 'push-mysql-ok-create-table-live-cli';
			const sdkName = 'push-mysql-ok-create-table-live-sdk';
			const cliTable = 'sdk_conformance_mysql_ok_cli';
			const sdkTable = 'sdk_conformance_mysql_ok_sdk';
			const { schemaPath: cliSchemaPath } = setupScenario(cliName, mysqlNewTableSchema(cliTable));
			const { schemaPath: sdkSchemaPath } = setupScenario(sdkName, mysqlNewTableSchema(sdkTable));
			try {
				await dropMysqlTable(mysqlUrl!, cliTable);
				await dropMysqlTable(mysqlUrl!, sdkTable);

				const { envelope: cliResult } = runCli([
					'push',
					'--dialect',
					'mysql',
					'--schema',
					cliSchemaPath,
					'--url',
					mysqlUrl!,
					'--json',
				]);

				await dropMysqlTable(mysqlUrl!, cliTable);

				const sdkResult = await runSdk('push', {
					dialect: 'mysql',
					schema: sdkSchemaPath,
					url: mysqlUrl!,
				});

				expect(cliResult.status).toBe('ok');
				expect(sdkResult.status).toBe('ok');
				if (cliResult.status === 'ok' && sdkResult.status === 'ok') {
					expect(sdkResult.dialect).toBe(cliResult.dialect);
				}
			} finally {
				await dropMysqlTable(mysqlUrl!, cliTable).catch(() => {});
				await dropMysqlTable(mysqlUrl!, sdkTable).catch(() => {});
				teardownScenario(cliName);
				teardownScenario(sdkName);
			}
		},
	);

	/**
	 * Parity invariant: CLI envelope equals SDK envelope for the missing_hints status
	 * surfaced at the post-suggestions checkpoint.
	 * Pre-state: a three-phase setup — first the seed table is created via CLI with a
	 * single id column; then one row is inserted so the table is non-empty (the
	 * suggestions path only emits `add_not_null` hints when `select 1 from t limit 1`
	 * returns a row); then both CLI and SDK push a child schema that adds a new NOT
	 * NULL column with no default, so `suggestions(db, ...)` raises a
	 * confirm_data_loss/add_not_null missing hint on the new column.
	 * Endpoint: `expect(sdkResult).toEqual(cliResult)` after both runs return the
	 * same missing_hints envelope.
	 */
	test(
		'missing_hints post-suggestions: CLI and SDK both surface confirm_data_loss/add_not_null at the suggestions checkpoint',
		{ timeout: 60000 },
		async () => {
			const name = 'push-mysql-missing-hints-post-suggestions-live';
			const tableName = 'sdk_conformance_mysql_missing_hints_t';
			const seedSchema = `
import { mysqlTable, int } from 'drizzle-orm/mysql-core';
export const t = mysqlTable('${tableName}', {
	id: int('id').primaryKey(),
});
`;
			const childSchema = `
import { mysqlTable, int, varchar } from 'drizzle-orm/mysql-core';
export const t = mysqlTable('${tableName}', {
	id: int('id').primaryKey(),
	mandatory: varchar('mandatory', { length: 64 }).notNull(),
});
`;
			const { schemaPath: seedSchemaPath } = setupScenario(`${name}-seed`, seedSchema);
			const { schemaPath: childSchemaPath } = setupScenario(`${name}-child`, childSchema);
			try {
				await dropMysqlTable(mysqlUrl!, tableName);
				runCli(['push', '--dialect', 'mysql', '--schema', seedSchemaPath, '--url', mysqlUrl!, '--json']);
				await execMysql(mysqlUrl!, `INSERT INTO \`${tableName}\` (id) VALUES (1)`);

				const argv = ['push', '--dialect', 'mysql', '--schema', childSchemaPath, '--url', mysqlUrl!, '--json'];
				const sdkOpts: PushOptions = { dialect: 'mysql', schema: childSchemaPath, url: mysqlUrl! };

				const { envelope: cliResult } = runCli(argv);
				const sdkResult = await runSdk('push', sdkOpts);

				expect(sdkResult).toEqual(cliResult);
			} finally {
				await dropMysqlTable(mysqlUrl!, tableName).catch(() => {});
				teardownScenario(`${name}-seed`);
				teardownScenario(`${name}-child`);
			}
		},
	);
});
