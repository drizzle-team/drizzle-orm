import { sql } from 'drizzle-orm';
import { migrate as libsqlMigrate, rollback as libsqlRollback } from 'drizzle-orm/libsql/migrator';
import { migrate as proxyMigrate, rollback as proxyRollback } from 'drizzle-orm/sqlite-proxy/migrator';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect } from 'vitest';
import { randomString } from '~/utils';
import { libSQLTest, proxyTest } from './instrumentation';

// Both fixtures share one database per file, so every test gets its own journal table and table names.
let folder: string;

function setup() {
	folder = mkdtempSync(join(tmpdir(), 'drizzle-sqlite-rollback-'));
	const suffix = randomString(8);
	return { journal: `__rollback_${suffix}`, a: `rb_a_${suffix}`, b: `rb_b_${suffix}` };
}

function writeMigration(name: string, up: string, down?: string) {
	mkdirSync(join(folder, name), { recursive: true });
	writeFileSync(join(folder, name, 'migration.sql'), up);
	if (down !== undefined) writeFileSync(join(folder, name, 'down.sql'), down);
}

afterEach(() => {
	rmSync(folder, { recursive: true, force: true });
});

type Db = { all: (query: ReturnType<typeof sql>) => Promise<unknown> };

async function tables(db: Db, ...names: string[]) {
	const rows = await db.all(
		sql`select name from sqlite_master where type = 'table' and name in ${names} order by name`,
	) as { name: string }[];
	return rows.map((row) => row.name);
}

async function journal(db: Db, table: string) {
	const rows = await db.all(sql`select name from ${sql.identifier(table)} order by id`) as { name: string }[];
	return rows.map((row) => row.name);
}

describe('libsql', () => {
	libSQLTest('rolls back several steps newest-first in one batch', async ({ db }) => {
		const t = setup();
		writeMigration('20240101000000_a', `CREATE TABLE "${t.a}" ("id" integer);`, `DROP TABLE "${t.a}";`);
		writeMigration('20240102000000_b', `CREATE TABLE "${t.b}" ("id" integer);`, `DROP TABLE "${t.b}";`);
		const config = { migrationsFolder: folder, migrationsTable: t.journal };
		await libsqlMigrate(db, config);

		const plan = await libsqlRollback(db, config, { steps: 2 });

		expect(plan.map((step) => step.name)).toStrictEqual(['20240102000000_b', '20240101000000_a']);
		expect(await tables(db, t.a, t.b)).toStrictEqual([]);
		expect(await journal(db, t.journal)).toStrictEqual([]);
	});

	libSQLTest('a failing down statement leaves the database and journal untouched', async ({ db }) => {
		const t = setup();
		writeMigration(
			'20240101000000_a',
			`CREATE TABLE "${t.a}" ("id" integer);`,
			`DROP TABLE "${t.a}";\n--> statement-breakpoint\nSELECT * FROM "${t.b}_missing";`,
		);
		const config = { migrationsFolder: folder, migrationsTable: t.journal };
		await libsqlMigrate(db, config);

		await expect(libsqlRollback(db, config)).rejects.toThrow();

		expect(await tables(db, t.a)).toStrictEqual([t.a]);
		expect(await journal(db, t.journal)).toStrictEqual(['20240101000000_a']);
	});

	libSQLTest('dryRun returns the plan without executing it', async ({ db }) => {
		const t = setup();
		writeMigration('20240101000000_a', `CREATE TABLE "${t.a}" ("id" integer);`, `DROP TABLE "${t.a}";`);
		const config = { migrationsFolder: folder, migrationsTable: t.journal };
		await libsqlMigrate(db, config);

		const plan = await libsqlRollback(db, config, { dryRun: true });

		expect(plan).toMatchObject([{ name: '20240101000000_a', downSql: [`DROP TABLE "${t.a}";`] }]);
		expect(await tables(db, t.a)).toStrictEqual([t.a]);
		expect(await journal(db, t.journal)).toStrictEqual(['20240101000000_a']);
	});
});

describe('sqlite-proxy', () => {
	proxyTest(
		'hands down statements and the journal delete to the callback in order',
		async ({ db, serverSimulator }) => {
			const t = setup();
			writeMigration(
				'20240101000000_a',
				`CREATE TABLE "${t.b}" ("id" integer);\n--> statement-breakpoint\nCREATE TABLE "${t.a}" ("id" integer);`,
				`DROP TABLE "${t.b}";\n--> statement-breakpoint\nDROP TABLE "${t.a}";`,
			);
			const config = { migrationsFolder: folder, migrationsTable: t.journal };
			const callback = async (queries: string[]) => {
				serverSimulator.migrations(queries);
			};
			await proxyMigrate(db, callback, config);

			const received: string[][] = [];
			await proxyRollback(db, async (queries) => {
				received.push(queries);
				await callback(queries);
			}, config);

			expect(received).toHaveLength(1);
			expect(received[0]!.slice(0, 2).map((query) => query.trim())).toStrictEqual([
				`DROP TABLE "${t.b}";`,
				`DROP TABLE "${t.a}";`,
			]);
			expect(received[0]![2]).toMatch(new RegExp(`^delete from "${t.journal}" where id = \\d+$`));
			expect(await tables(db, t.a, t.b)).toStrictEqual([]);
			expect(await journal(db, t.journal)).toStrictEqual([]);
		},
	);

	proxyTest('dryRun never calls the callback', async ({ db, serverSimulator }) => {
		const t = setup();
		writeMigration('20240101000000_a', `CREATE TABLE "${t.a}" ("id" integer);`, `DROP TABLE "${t.a}";`);
		const config = { migrationsFolder: folder, migrationsTable: t.journal };
		await proxyMigrate(db, async (queries) => {
			serverSimulator.migrations(queries);
		}, config);

		let called = false;
		const plan = await proxyRollback(
			db,
			async () => {
				called = true;
			},
			config,
			{ dryRun: true },
		);

		expect(plan.map((step) => step.name)).toStrictEqual(['20240101000000_a']);
		expect(called).toBe(false);
		expect(await tables(db, t.a)).toStrictEqual([t.a]);
	});
});
