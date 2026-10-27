import { sql } from 'drizzle-orm';
import type { MigrationConfig } from 'drizzle-orm/migrator';
import type { DsqlAsyncDatabase } from 'drizzle-orm/pg-core/async/dsql';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect } from 'vitest';
import { randomString } from '~/utils';
import type { nodePgDsqlTest } from './instrumentation';
import { retryOcc } from './occ';

type Migrate = (db: any, config: MigrationConfig) => Promise<unknown>;

const fixtures = (name: string) => join(__dirname, '../../drizzle2', name);

// Copies the first `count` migrations of a fixture folder, so a test can add data between two migrations.
const stage = (folder: string, name: string, count: number) => {
	const from = fixtures(name);
	for (const migration of readdirSync(from).sort().slice(0, count)) {
		cpSync(join(from, migration), join(folder, migration), { recursive: true });
	}
};

const rowsOf = <T>(result: unknown): T[] => (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];

const query = async <T>(db: DsqlAsyncDatabase<any, any>, q: ReturnType<typeof sql>) => {
	return rowsOf<T>(await retryOcc(() => db.execute(q)));
};

const indexState = async (db: DsqlAsyncDatabase<any, any>, name: string) => {
	const rows = await query<{ indisvalid: boolean }>(
		db,
		sql`select i.indisvalid from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid = i.indexrelid where c.relname = ${name}`,
	);
	return rows.length === 0 ? null : rows[0]!.indisvalid;
};

const constraintState = async (db: DsqlAsyncDatabase<any, any>, name: string) => {
	const rows = await query<{ convalidated: boolean }>(
		db,
		sql`select convalidated from pg_catalog.pg_constraint where conname = ${name}`,
	);
	return rows.length === 0 ? null : rows[0]!.convalidated;
};

// Migrations that drizzle-kit generates with driver 'dsql' start async jobs. These run them through the
// migrator of each DSQL driver.
export const migratorJobTests = (test: typeof nodePgDsqlTest, migrate: Migrate) => {
	describe('migrator : async jobs', () => {
		const setup = (tables: string[]) => {
			const folder = mkdtempSync(join(tmpdir(), 'dsql-migrator-jobs-'));
			const table = `migrations_${randomString()}`;
			const drop = async (db: DsqlAsyncDatabase<any, any>) => {
				for (const it of [...tables, table]) {
					await retryOcc(() =>
						db.execute(sql`drop table if exists ${sql.identifier('drizzle')}.${sql.identifier(it)}`)
					);
					await retryOcc(() => db.execute(sql`drop table if exists ${sql.identifier(it)}`));
				}
			};
			return { folder, table, drop };
		};

		test('waits for the index, foreign key and check of a migration', async ({ db }) => {
			const { folder, table, drop } = setup(['dsql_jobs_items', 'dsql_jobs_parent']);
			await drop(db);
			try {
				stage(folder, 'dsql-jobs', 1);
				await migrate(db, { migrationsFolder: folder, migrationsTable: table });
				await retryOcc(() => db.execute(sql`insert into "dsql_jobs_parent" values (gen_random_uuid())`));
				await retryOcc(() =>
					db.execute(sql`insert into "dsql_jobs_items" select gen_random_uuid(), 1, "id" from "dsql_jobs_parent"`)
				);

				stage(folder, 'dsql-jobs', 2);
				await migrate(db, { migrationsFolder: folder, migrationsTable: table });

				expect(await indexState(db, 'dsql_jobs_items_code_idx')).toBe(true);
				expect(await constraintState(db, 'dsql_jobs_items_parent_fk')).toBe(true);
				expect(await constraintState(db, 'dsql_jobs_items_code_check')).toBe(true);
				const recorded = await query(db, sql`select 1 from "drizzle".${sql.identifier(table)}`);
				expect(recorded).toHaveLength(2);
			} finally {
				await drop(db);
				rmSync(folder, { recursive: true, force: true });
			}
		});

		test('a failed unique index throws with the reason, is dropped, and is not recorded', async ({ db }) => {
			const { folder, table, drop } = setup(['dsql_jobs_dupes']);
			await drop(db);
			try {
				stage(folder, 'dsql-jobs-fail', 1);
				await migrate(db, { migrationsFolder: folder, migrationsTable: table });
				await retryOcc(() =>
					db.execute(sql`insert into "dsql_jobs_dupes" values (gen_random_uuid(), 1), (gen_random_uuid(), 1)`)
				);

				stage(folder, 'dsql-jobs-fail', 2);
				const error = await migrate(db, { migrationsFolder: folder, migrationsTable: table }).then(
					() => null,
					(e: Error) => e,
				);

				expect(error).toBeInstanceOf(Error);
				expect(error?.message).toContain('unique_index');
				expect(error?.message).toContain('found duplicate key(s) while validating index uniqueness');
				expect(await indexState(db, 'dsql_jobs_dupes_code_key')).toBeNull();
				const recorded = await query(db, sql`select 1 from "drizzle".${sql.identifier(table)}`);
				expect(recorded).toHaveLength(1);
			} finally {
				await drop(db);
				rmSync(folder, { recursive: true, force: true });
			}
		});

		test('a migration whose recreated index fails runs again once the data is fixed', async ({ db }) => {
			const { folder, table, drop } = setup(['dsql_jobs_recreate']);
			await drop(db);
			try {
				stage(folder, 'dsql-jobs-recreate', 1);
				await migrate(db, { migrationsFolder: folder, migrationsTable: table });
				await retryOcc(() =>
					db.execute(sql`insert into "dsql_jobs_recreate" values (gen_random_uuid(), 5), (gen_random_uuid(), 5)`)
				);

				stage(folder, 'dsql-jobs-recreate', 2);
				await expect(migrate(db, { migrationsFolder: folder, migrationsTable: table })).rejects.toThrowError(
					/found duplicate key/,
				);
				expect(await indexState(db, 'dsql_jobs_recreate_code_key')).toBeNull();

				await retryOcc(() =>
					db.execute(
						sql`delete from "dsql_jobs_recreate" where "id" = (select "id" from "dsql_jobs_recreate" limit 1)`,
					)
				);
				await migrate(db, { migrationsFolder: folder, migrationsTable: table });

				expect(await indexState(db, 'dsql_jobs_recreate_code_key')).toBe(true);
				const recorded = await query(db, sql`select 1 from "drizzle".${sql.identifier(table)}`);
				expect(recorded).toHaveLength(2);
			} finally {
				await drop(db);
				rmSync(folder, { recursive: true, force: true });
			}
		});
	});
};
