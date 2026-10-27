import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgRole, pgSchema, serial, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { DsqlAsyncJobError, DsqlInvalidObjectsError, UnsupportedSchemaChangeError } from 'src/cli/errors';
import { DSQL_REASONS, isDsqlOcc, runDsqlStatements } from 'src/dialects/postgres/dsql';
import type { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	assertNothingLeft,
	connect,
	connectRaw,
	constraintState,
	dropRun,
	type DsqlDB,
	isValidIndex,
	push,
	pushTo,
	runId,
	runSchemas,
} from './mocks';

const s = runId;
const schema = pgSchema(s);
const app = `${runId}_app`;
const roles = [app];

// Every DSQL index build and constraint validation is an async job that takes several seconds.
vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

let db: DsqlDB;

beforeAll(async () => {
	db = await connect();
	await dropRun(db, roles);
});

beforeEach(async () => {
	await dropRun(db, roles);
});

afterAll(async () => {
	await dropRun(db, roles);
	await assertNothingLeft(db);
});

const items = (extra?: (t: any) => any[]) =>
	schema.table('items', { id: uuid().primaryKey(), code: integer() }, extra ?? (() => []));

const insertItems = async (codes: number[]) => {
	for (const code of codes) {
		await db.query(`INSERT INTO "${s}"."items" ("id", "code") VALUES (gen_random_uuid(), ${code});`);
	}
};

describe('async jobs', () => {
	test('push waits for an index on a populated table', async () => {
		await pushTo(db, { schema, items: items() });
		await insertItems([1, 2, 3]);

		const to = { schema, items: items((t) => [index('items_code_idx').on(t.code)]) };
		expect(await push(to)).toStrictEqual({ status: 'ok', dialect: 'postgresql' });

		expect(await isValidIndex(db, s, 'items_code_idx')).toBe(true);
		expect(await push(to)).toStrictEqual({ status: 'no_changes', dialect: 'postgresql' });
	});

	test('a unique index over duplicate rows fails, is dropped, and builds once the data is fixed', async () => {
		await pushTo(db, { schema, items: items() });
		await insertItems([1, 1]);
		const to = { schema, items: items((t) => [uniqueIndex('items_code_key').on(t.code)]) };

		const error = await push(to).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlAsyncJobError);
		expect(error.meta).toMatchObject({
			job_type: 'INDEX_BUILD',
			details: 'found duplicate key(s) while validating index uniqueness',
		});
		expect(error.meta).not.toHaveProperty('cleanup_error');
		expect(await isValidIndex(db, s, 'items_code_key')).toBeNull();

		await db.query(`DELETE FROM "${s}"."items" WHERE "id" IN (SELECT "id" FROM "${s}"."items" LIMIT 1);`);
		expect(await push(to)).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
		expect(await isValidIndex(db, s, 'items_code_key')).toBe(true);
		expect(await push(to)).toStrictEqual({ status: 'no_changes', dialect: 'postgresql' });
	});

	test('a foreign key over orphan rows fails, is dropped, and validates once the data is fixed', async () => {
		const parent = schema.table('parent', { id: uuid().primaryKey() });
		const child = (fk: boolean) =>
			schema.table(
				'child',
				{ id: uuid().primaryKey(), parentId: uuid('parent_id') },
				(t) => fk ? [foreignKey({ name: 'child_parent_fk', columns: [t.parentId], foreignColumns: [parent.id] })] : [],
			);
		await pushTo(db, { schema, parent, child: child(false) });
		await db.query(`INSERT INTO "${s}"."child" VALUES (gen_random_uuid(), gen_random_uuid());`);

		const error = await push({ schema, parent, child: child(true) }).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlAsyncJobError);
		expect(error.meta.job_type).toBe('VALIDATE_CONSTRAINT');
		expect(await constraintState(db, s, 'child_parent_fk')).toBeNull();

		await db.query(`DELETE FROM "${s}"."child";`);
		expect(await push({ schema, parent, child: child(true) })).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
		expect(await constraintState(db, s, 'child_parent_fk')).toBe(true);
		expect(await push({ schema, parent, child: child(true) })).toStrictEqual({
			status: 'no_changes',
			dialect: 'postgresql',
		});
	});

	test('a check over violating rows fails, is dropped, and validates once the data is fixed', async () => {
		await pushTo(db, { schema, items: items() });
		await insertItems([-1]);
		const to = { schema, items: items((t) => [check('items_code_check', sql`${t.code} > 0`)]) };

		const error = await push(to).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlAsyncJobError);
		expect(error.meta.details).toContain('items_code_check');
		expect(await constraintState(db, s, 'items_code_check')).toBeNull();

		await db.query(`UPDATE "${s}"."items" SET "code" = 1;`);
		expect(await push(to)).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
		expect(await constraintState(db, s, 'items_code_check')).toBe(true);
	});

	test('a failed recreate leaves neither index', async () => {
		await pushTo(db, { schema, items: items((t) => [index('items_code_idx').on(t.code)]) });
		await insertItems([1, 1]);

		const error = await push({ schema, items: items((t) => [uniqueIndex('items_code_idx').on(t.code)]) })
			.catch((e) => e);

		expect(error).toBeInstanceOf(DsqlAsyncJobError);
		expect(await isValidIndex(db, s, 'items_code_idx')).toBeNull();
	});
});

describe('invalid objects', () => {
	const failedIndex = async (table: string) => {
		const [{ job_id }] = await db.query<{ job_id: string }>(
			`CREATE UNIQUE INDEX ASYNC "${table}_code_key" ON "${s}"."${table}" ("code");`,
		);
		await db.query('CALL sys.wait_for_job($1)', [job_id]);
		expect(await isValidIndex(db, s, `${table}_code_key`)).toBe(false);
	};

	test('push refuses to run while an index from an earlier run is invalid', async () => {
		await pushTo(db, { schema, items: items() });
		await insertItems([1, 1]);
		await failedIndex('items');

		const error = await push({ schema, items: items() }).catch((e) => e);

		expect(error).toBeInstanceOf(DsqlInvalidObjectsError);
		expect(error.meta).toStrictEqual({ indexes: [`${s}.items.items_code_key`], constraints: [] });
	});

	test('push waits for an index build that is still running', async () => {
		await pushTo(db, { schema, items: items() });
		await insertItems([1, 2]);
		const [{ job_id }] = await db.query<{ job_id: string }>(
			`CREATE INDEX ASYNC "items_code_idx" ON "${s}"."items" ("code");`,
		);
		const [job] = await db.query<{ status: string }>('SELECT status FROM sys.jobs WHERE job_id = $1', [job_id]);
		expect(['submitted', 'processing']).toContain(job!.status);

		const res = await push({ schema, items: items((t) => [index('items_code_idx').on(t.code)]) });

		expect(res).toStrictEqual({ status: 'no_changes', dialect: 'postgresql' });
		expect(await isValidIndex(db, s, 'items_code_idx')).toBe(true);
	});

	test('push ignores an invalid index on the migrations table', async () => {
		// The migrations table lives in its own schema, like the default `drizzle` schema.
		const m = runSchemas[1]!;
		const migrationsSchema = pgSchema(m);
		const migrations = migrationsSchema.table('migrations', { id: uuid().primaryKey(), code: integer() });
		await pushTo(db, { migrationsSchema, migrations });
		await db.query(`INSERT INTO "${m}"."migrations" VALUES (gen_random_uuid(), 1), (gen_random_uuid(), 1);`);
		const [{ job_id }] = await db.query<{ job_id: string }>(
			`CREATE UNIQUE INDEX ASYNC "migrations_code_key" ON "${m}"."migrations" ("code");`,
		);
		await db.query('CALL sys.wait_for_job($1)', [job_id]);
		expect(await isValidIndex(db, m, 'migrations_code_key')).toBe(false);

		const res = await push({ schema, items: items() }, { migrations: { schema: m, table: 'migrations' } });

		// The invalid-object check skips the migrations table, so push runs. The diff then drops the index, because
		// beta's `filterMigrationsSchema` hides the migrations table but not its indexes.
		expect(res).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
	});
});

test('push rejects an unsupported change before running anything', async () => {
	const error = await push({ schema, t: schema.table('serial_t', { id: serial().primaryKey() }) }).catch((e) => e);

	expect(error).toBeInstanceOf(UnsupportedSchemaChangeError);
	expect(error.meta.issues).toStrictEqual([
		{ statement: 'create_table', entity: `${s}.serial_t.id`, reason: DSQL_REASONS.serial },
	]);
	const schemas = await db.query(`SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = $1`, [s]);
	expect(schemas).toStrictEqual([]);
});

test('push never manages the DSQL system roles', async () => {
	const to = { admin: pgRole('admin').existing(), app: pgRole(app, { canLogin: true }) };

	expect(await push(to, { roles: ['admin', app] })).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
	expect(await push(to, { roles: ['admin', app] })).toStrictEqual({ status: 'no_changes', dialect: 'postgresql' });
	const [role] = await db.query<{ rolcanlogin: boolean }>('SELECT rolcanlogin FROM pg_roles WHERE rolname = $1', [app]);
	expect(role!.rolcanlogin).toBe(true);

	const error = await push({ admin: pgRole('admin'), app: pgRole(app, { canLogin: true }) }, { roles: ['admin', app] })
		.catch((e) => e);
	expect(error).toBeInstanceOf(UnsupportedSchemaChangeError);
	expect(error.meta.issues).toStrictEqual([
		{ statement: 'create_role', entity: 'admin', reason: DSQL_REASONS.systemRole('admin') },
	]);
});

test('DSQL stores numeric without a precision as numeric(18,6)', async () => {
	await db.query(`CREATE SCHEMA "${s}";`);
	await db.query(`CREATE TABLE "${s}"."n" ("id" uuid PRIMARY KEY, "v" numeric);`);

	const [column] = await db.query<{ type: string }>(
		`SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) AS "type" FROM pg_catalog.pg_attribute a WHERE a.attrelid = '"${s}"."n"'::regclass AND a.attname = 'v'`,
	);
	expect(column!.type).toBe('numeric(18,6)');
});

test('a statement that hits an OCC conflict runs again', async () => {
	await pushTo(db, { schema, items: items(), other: schema.table('other', { id: uuid().primaryKey() }) });
	const raw = await connectRaw();
	const other = await connectRaw();
	const occ: unknown[] = [];
	const watched: DB = {
		query: async (query, params) => {
			try {
				return await raw.query(query, params);
			} catch (e) {
				if (isDsqlOcc(e)) {
					occ.push(e);
					stop = true;
				}
				throw e;
			}
		},
	};

	let stop = false;
	for (let attempt = 0; attempt < 10 && occ.length === 0; attempt++) {
		stop = false;
		const storm = (async () => {
			for (let i = 0; !stop && i < 50; i++) {
				await other.query(`ALTER TABLE "${s}"."other" ADD COLUMN "c${attempt}_${i}" integer;`).catch(() => {});
			}
		})();
		await runDsqlStatements(watched, [`ALTER TABLE "${s}"."items" ADD COLUMN "added_${attempt}" integer;`]);
		stop = true;
		await storm;
	}

	expect(occ.length, 'an OCC conflict happened and was retried').toBeGreaterThan(0);
	const columns = await db.query<{ attname: string }>(
		`SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid = '"${s}"."items"'::regclass AND attname LIKE 'added_%'`,
	);
	expect(columns.length).toBeGreaterThan(0);
});
