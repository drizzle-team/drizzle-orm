/**
 * DSQL Introspection Tests
 *
 * Tests that verify drizzle-kit can correctly introspect a DSQL database.
 * These tests run against a real DSQL cluster.
 *
 * Required environment variable:
 *   DSQL_CLUSTER_ENDPOINT - The full DSQL cluster endpoint (e.g., "abc123.dsql.us-west-2.on.aws")
 *
 * The tests will:
 * 1. Create tables with various features (columns, indexes, constraints)
 * 2. Run introspection
 * 3. Verify the introspected schema matches what was created
 * 4. Clean up
 *
 * Note: DSQL has limitations compared to PostgreSQL:
 * - Only btree indexes (no hash, gin, gist)
 * - No enums
 * - Sequences and identity columns require CACHE (must be 1 or >= 65536)
 */

import { sql } from 'drizzle-orm';
import { toCamelCase } from 'drizzle-orm/casing';
import { drizzle, type DSQLDatabase } from 'drizzle-orm/dsql';
import { mkdtempSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { handle as pull } from '../../src/cli/commands/pull-dsql';
import { fromDatabase } from '../../src/dialects/dsql/introspect';
import { interimToDDL } from '../../src/dialects/postgres/ddl';
import { ddlToTypeScript } from '../../src/dialects/postgres/typescript';
import type { DB } from '../../src/utils';

const ENABLE_LOGGING = false;

let dsqlDb: DSQLDatabase<any>;
let db: DB;

// Generate unique names to avoid conflicts between test runs
const testRunId = Math.random().toString(36).substring(2, 8);
const uniqueName = (base: string) => `${base}_${testRunId}`;

// Check if DSQL cluster is available for tests
const skipIfNoCluster = () => {
	const clusterEndpoint = process.env['DSQL_CLUSTER_ENDPOINT'];
	return { skip: !clusterEndpoint, reason: 'DSQL_CLUSTER_ENDPOINT environment variable not set' };
};

// Simple retry helper
async function retry<T>(fn: () => Promise<T>, maxRetries = 20, delay = 250): Promise<T> {
	let lastError: Error | undefined;
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await fn();
		} catch (e) {
			lastError = e as Error;
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	throw lastError;
}

beforeAll(async () => {
	if (skipIfNoCluster().skip) {
		return;
	}

	const clusterEndpoint = process.env['DSQL_CLUSTER_ENDPOINT']!;

	dsqlDb = await retry(async () => {
		const database = drizzle({
			connection: {
				host: clusterEndpoint,
			},
			logger: ENABLE_LOGGING,
		});
		await database.execute(sql`SELECT 1`);
		return database;
	});

	// Create DB adapter for drizzle-kit introspection
	db = {
		query: async <T>(sqlStr: string, params?: any[]): Promise<T[]> => {
			const result = await dsqlDb.execute(sql.raw(sqlStr));
			return (result as any).rows as T[];
		},
	};
});

afterAll(async () => {
	// Cleanup is handled per-test
});

describe.skipIf(skipIfNoCluster().skip)('DSQL introspection', () => {
	test('introspect basic table', async () => {
		const tableName = uniqueName('basic_table');

		// Create table
		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				name text NOT NULL,
				email text,
				created_at timestamptz DEFAULT now()
			)
		`);

		try {
			// Introspect
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			// Find our table
			const table = ddl.tables.one({ name: tableName });
			expect(table).toBeTruthy();
			expect(table?.schema).toBe('public');

			// Check columns
			const columns = ddl.columns.list({ table: tableName });
			expect(columns).toHaveLength(4);

			const idCol = columns.find((c) => c.name === 'id');
			expect(idCol).toBeTruthy();
			expect(idCol?.type).toBe('uuid');
			expect(idCol?.notNull).toBe(true);

			const nameCol = columns.find((c) => c.name === 'name');
			expect(nameCol).toBeTruthy();
			expect(nameCol?.type).toBe('text');
			expect(nameCol?.notNull).toBe(true);

			const emailCol = columns.find((c) => c.name === 'email');
			expect(emailCol).toBeTruthy();
			expect(emailCol?.notNull).toBe(false);

			// Check primary key
			const pk = ddl.pks.one({ table: tableName });
			expect(pk).toBeTruthy();
			expect(pk?.columns).toContain('id');
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect table with index', async () => {
		const tableName = uniqueName('indexed_table');
		const indexName = uniqueName('name_idx');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				name text NOT NULL
			)
		`);

		// DSQL requires ASYNC index creation
		await dsqlDb.execute(sql.raw(
			`CREATE INDEX ASYNC "${indexName}" ON "${tableName}" (name)`,
		));

		// Wait for index to be created
		await new Promise((r) => setTimeout(r, 2000));

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			// Find index (excluding PK-backing indexes)
			const indexes = ddl.indexes.list({ table: tableName });
			const idx = indexes.find((i) => i.name === indexName);
			expect(idx).toBeTruthy();
			expect(idx?.isUnique).toBe(false);
			expect(idx?.method).toBe('btree');
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect table with unique constraint', async () => {
		const tableName = uniqueName('unique_table');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				email text NOT NULL UNIQUE
			)
		`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const uniques = ddl.uniques.list({ table: tableName });
			expect(uniques.length).toBeGreaterThan(0);

			const emailUnique = uniques.find((u) => u.columns.includes('email'));
			expect(emailUnique).toBeTruthy();
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect table with foreign key', async () => {
		const parentTable = uniqueName('fk_parent');
		const childTable = uniqueName('fk_child');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(parentTable)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid()
			)
		`);
		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(childTable)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				parent_id uuid REFERENCES ${sql.identifier(parentTable)}(id) ON DELETE CASCADE
			)
		`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const fks = ddl.fks.list({ table: childTable });
			expect(fks).toHaveLength(1);
			expect(fks[0]?.tableTo).toBe(parentTable);
			expect(fks[0]?.columns).toStrictEqual(['parent_id']);
			expect(fks[0]?.columnsTo).toStrictEqual(['id']);
			expect(fks[0]?.onDelete).toBe('CASCADE');
			expect(fks[0]?.onUpdate).toBe('NO ACTION');
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(childTable)} CASCADE`);
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(parentTable)} CASCADE`);
		}
	});

	test('introspect table with check constraint', async () => {
		const tableName = uniqueName('check_table');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				age integer CHECK (age >= 0)
			)
		`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const checks = ddl.checks.list({ table: tableName });
			expect(checks.length).toBeGreaterThan(0);
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect not valid check constraint', async () => {
		const tableName = uniqueName('check_not_valid_table');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				age integer
			)
		`);
		// Constraints added with ALTER TABLE stay NOT VALID until validated
		await dsqlDb.execute(
			sql`ALTER TABLE ${sql.identifier(tableName)} ADD CONSTRAINT age_check CHECK (age >= 0) NOT VALID`,
		);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const check = ddl.checks.one({ table: tableName, name: 'age_check' });
			expect(check?.value).toBe('(age >= 0)');
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect table in custom schema', async () => {
		const schemaName = uniqueName('test_schema');
		const tableName = uniqueName('schema_table');

		await dsqlDb.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(schemaName)}`);
		await dsqlDb.execute(sql.raw(
			`CREATE TABLE "${schemaName}"."${tableName}" (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				name text NOT NULL
			)`,
		));

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			// Check schema exists
			const schemas = ddl.schemas.list();
			const testSchema = schemas.find((s) => s.name === schemaName);
			expect(testSchema).toBeTruthy();

			// Check table in schema
			const table = ddl.tables.one({ schema: schemaName, name: tableName });
			expect(table).toBeTruthy();
		} finally {
			await dsqlDb.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(schemaName)} CASCADE`);
		}
	});

	// Note: DSQL only supports btree indexes, hash indexes are not supported
	// test('introspect hash index', ...) is skipped

	test('introspect table with multiple column types', async () => {
		const tableName = uniqueName('types_table');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				name varchar(255) NOT NULL,
				description text,
				count integer DEFAULT 0,
				amount numeric(10, 2),
				is_active boolean DEFAULT true,
				created_at timestamptz DEFAULT now(),
				updated_at timestamp
			)
		`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const columns = ddl.columns.list({ table: tableName });
			expect(columns.length).toBe(8);

			// Check various column types
			const nameCol = columns.find((c) => c.name === 'name');
			expect(nameCol?.type).toBe('varchar(255)');

			const countCol = columns.find((c) => c.name === 'count');
			expect(countCol?.type).toBe('integer');

			const amountCol = columns.find((c) => c.name === 'amount');
			expect(amountCol?.type).toBe('numeric(10,2)');

			const isActiveCol = columns.find((c) => c.name === 'is_active');
			expect(isActiveCol?.type).toBe('boolean');
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect table with composite primary key', async () => {
		const tableName = uniqueName('composite_pk_table');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				tenant_id uuid NOT NULL,
				user_id uuid NOT NULL,
				role text NOT NULL,
				PRIMARY KEY (tenant_id, user_id)
			)
		`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const pk = ddl.pks.one({ table: tableName });
			expect(pk).toBeTruthy();
			expect(pk?.columns).toContain('tenant_id');
			expect(pk?.columns).toContain('user_id');
			expect(pk?.columns).toHaveLength(2);
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect table with composite unique constraint', async () => {
		const tableName = uniqueName('composite_unique_table');

		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				tenant_id uuid NOT NULL,
				email text NOT NULL,
				UNIQUE (tenant_id, email)
			)
		`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const uniques = ddl.uniques.list({ table: tableName });
			const compositeUnique = uniques.find(
				(u) => u.columns.includes('tenant_id') && u.columns.includes('email'),
			);
			expect(compositeUnique).toBeTruthy();
			expect(compositeUnique?.columns).toHaveLength(2);
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect roles', async () => {
		const roleName = uniqueName('test_role');

		await dsqlDb.execute(sql`CREATE ROLE ${sql.identifier(roleName)}`);

		try {
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			// Find our role
			const roles = ddl.roles.list();
			const testRole = roles.find((r) => r.name === roleName);
			expect(testRole).toBeTruthy();
			expect(testRole?.name).toBe(roleName);
		} finally {
			await dsqlDb.execute(sql`DROP ROLE IF EXISTS ${sql.identifier(roleName)}`);
		}
	});

	test('introspect complex SQL defaults', async () => {
		const tableName = uniqueName('complex_defaults');

		// Create table with complex SQL default expressions
		await dsqlDb.execute(sql`
			CREATE TABLE ${sql.identifier(tableName)} (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				random_int integer DEFAULT floor((random() * 100)),
				random_real real DEFAULT random(),
				computed_value double precision DEFAULT (random() * 100 + 50)
			)
		`);

		try {
			// Introspect the database
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			// Verify our table was introspected
			const table = ddl.tables.one({ name: tableName });
			expect(table).toBeTruthy();

			// Check the raw default values in DDL columns
			const columns = ddl.columns.list({ table: tableName });
			const randomIntCol = columns.find((c) => c.name === 'random_int');
			const randomRealCol = columns.find((c) => c.name === 'random_real');
			const computedCol = columns.find((c) => c.name === 'computed_value');

			// Defaults should be present
			expect(randomIntCol?.default).toBeTruthy();
			expect(randomRealCol?.default).toBeTruthy();
			expect(computedCol?.default).toBeTruthy();

			// Generate TypeScript code
			const { file: tsOutput } = ddlToTypeScript(ddl, [], 'camel', 'dsql');

			// Verify complex defaults are wrapped in sql``
			// Complex expressions like floor((random() * 100)) should be wrapped with sql`...`
			// The default for random_int should be sql`floor(...)` not floor(...)
			expect(tsOutput).toMatch(/\.default\(sql`/); // Should have sql`` wrapper
			expect(tsOutput).not.toMatch(/\.default\(floor\(/); // Should NOT be raw expression
			expect(tsOutput).not.toMatch(/\.default\(\(random\(/); // Should NOT be raw expression
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Introspect - Sequences', () => {
	test('introspect sequence with default cache', async () => {
		const seqName = uniqueName('introspect_seq_default');

		try {
			// Create sequence with default DSQL cache value
			await dsqlDb.execute(sql.raw(`CREATE SEQUENCE "${seqName}" CACHE 65536`));

			// Introspect
			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			// Verify sequence was introspected
			const seq = ddl.sequences.one({ name: seqName });
			expect(seq).toBeTruthy();
			expect(seq?.cacheSize).toBe(65536);
		} finally {
			await dsqlDb.execute(sql`DROP SEQUENCE IF EXISTS ${sql.identifier(seqName)}`);
		}
	});

	test('introspect sequence with cache = 1', async () => {
		const seqName = uniqueName('introspect_seq_cache1');

		try {
			await dsqlDb.execute(sql.raw(`CREATE SEQUENCE "${seqName}" CACHE 1`));

			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const seq = ddl.sequences.one({ name: seqName });
			expect(seq).toBeTruthy();
			expect(seq?.cacheSize).toBe(1);
		} finally {
			await dsqlDb.execute(sql`DROP SEQUENCE IF EXISTS ${sql.identifier(seqName)}`);
		}
	});

	test('introspect sequence with all options', async () => {
		const seqName = uniqueName('introspect_seq_full');

		try {
			await dsqlDb.execute(
				sql.raw(
					`CREATE SEQUENCE "${seqName}" INCREMENT BY 5 MINVALUE 10 MAXVALUE 10000 START WITH 100 CACHE 65536 CYCLE`,
				),
			);

			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const seq = ddl.sequences.one({ name: seqName });
			expect(seq).toBeTruthy();
			expect(seq?.incrementBy).toBe('5');
			expect(seq?.minValue).toBe('10');
			expect(seq?.maxValue).toBe('10000');
			expect(seq?.startWith).toBe('100');
			expect(seq?.cacheSize).toBe(65536);
			expect(seq?.cycle).toBe(true);
		} finally {
			await dsqlDb.execute(sql`DROP SEQUENCE IF EXISTS ${sql.identifier(seqName)}`);
		}
	});

	test('introspect sequence in custom schema', async () => {
		const schemaName = uniqueName('introspect_seq_schema');
		const seqName = uniqueName('seq_in_schema');

		try {
			await dsqlDb.execute(sql.raw(`CREATE SCHEMA "${schemaName}"`));
			await dsqlDb.execute(sql.raw(`CREATE SEQUENCE "${schemaName}"."${seqName}" CACHE 65536`));

			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const seq = ddl.sequences.one({ schema: schemaName, name: seqName });
			expect(seq).toBeTruthy();
			expect(seq?.schema).toBe(schemaName);
		} finally {
			await dsqlDb.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`));
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Introspect - Identity Columns', () => {
	test('introspect identity column', async () => {
		const tableName = uniqueName('introspect_ident');

		try {
			await dsqlDb.execute(
				sql.raw(
					`CREATE TABLE "${tableName}" (id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (START WITH 10 INCREMENT BY 2 CACHE 65536), name text)`,
				),
			);

			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const idCol = ddl.columns.one({ table: tableName, name: 'id' });
			expect(idCol?.identity).toBeTruthy();
			expect(idCol?.identity?.type).toBe('always');
			expect(idCol?.identity?.startWith).toBe('10');
			expect(idCol?.identity?.increment).toBe('2');
			expect(idCol?.identity?.cache).toBe(65536);

			// Identity sequences are not introspected as standalone sequences
			expect(ddl.sequences.one({ name: idCol!.identity!.name })).toBeNull();
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('introspect generated by default identity column with cache = 1', async () => {
		const tableName = uniqueName('introspect_ident_bd');

		try {
			await dsqlDb.execute(
				sql.raw(`CREATE TABLE "${tableName}" (id bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (CACHE 1))`),
			);

			const schema = await fromDatabase(db, (it) => it.type !== 'table' || it.name === tableName);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const idCol = ddl.columns.one({ table: tableName, name: 'id' });
			expect(idCol?.identity?.type).toBe('byDefault');
			expect(idCol?.identity?.cache).toBe(1);

			// CACHE 1 differs from the DSQL default of 65536, so pull must keep it
			const { file: tsOutput } = ddlToTypeScript(ddl, [], 'camel', 'dsql');
			expect(tsOutput).toContain('.generatedByDefaultAsIdentity({ cache: 1 })');
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Introspect - Column Types and TypeScript', () => {
	test('introspect json and jsonb columns', async () => {
		const tableName = uniqueName('introspect_json');

		try {
			await dsqlDb.execute(
				sql.raw(
					`CREATE TABLE "${tableName}" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data json, metadata jsonb)`,
				),
			);

			const schema = await fromDatabase(db, () => true);
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			expect(ddl.columns.one({ table: tableName, name: 'data' })?.type).toBe('json');
			expect(ddl.columns.one({ table: tableName, name: 'metadata' })?.type).toBe('jsonb');
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});

	test('generate TypeScript for foreign keys, identity and json columns', async () => {
		const parentTable = uniqueName('ts_parent');
		const childTable = uniqueName('ts_child');

		try {
			await dsqlDb.execute(
				sql.raw(`CREATE TABLE "${parentTable}" (id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (CACHE 65536))`),
			);
			await dsqlDb.execute(
				sql.raw(
					`CREATE TABLE "${childTable}" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id bigint REFERENCES "${parentTable}"(id), data jsonb)`,
				),
			);

			const schema = await fromDatabase(db, (it) => it.type !== 'table' || [parentTable, childTable].includes(it.name));
			const { ddl, errors } = interimToDDL(schema);

			expect(errors).toHaveLength(0);

			const { file: tsOutput } = ddlToTypeScript(ddl, [], 'camel', 'dsql');

			expect(tsOutput).toContain('from "drizzle-orm/dsql-core"');
			// dsql-core's bigint() has no mode option
			expect(tsOutput).toContain('\tid: bigint().primaryKey().generatedAlwaysAsIdentity(),\n');
			expect(tsOutput).toContain(
				`\tparentId: bigint("parent_id").references(() => ${toCamelCase(parentTable)}.id),\n`,
			);
			expect(tsOutput).toContain('jsonb(');
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(childTable)} CASCADE`);
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(parentTable)} CASCADE`);
		}
	});
});

describe.skipIf(skipIfNoCluster().skip)('DSQL Introspect - Pull', () => {
	// DSQL has no init migration, so pull doesn't write a snapshot or an introspect migration
	test('pull writes only schema and relations files', async () => {
		const tableName = uniqueName('pull_files');
		const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-dsql-pull-'));

		try {
			await dsqlDb.execute(
				sql.raw(`CREATE TABLE "${tableName}" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text)`),
			);
			await dsqlDb.execute(sql.raw(`CREATE INDEX ASYNC "${tableName}_name_idx" ON "${tableName}" (name)`));

			const manifest = await pull(
				'camel',
				out,
				true,
				{ host: process.env['DSQL_CLUSTER_ENDPOINT']! },
				{ schemas: undefined, tables: [tableName], entities: undefined, extensions: undefined },
				{ schema: 'drizzle', table: '__drizzle_migrations' },
				db,
			);

			expect(manifest).toStrictEqual({
				schemaPath: join(out, 'schema.ts'),
				relationsPath: join(out, 'relations.ts'),
			});
			expect(readdirSync(out).sort()).toStrictEqual(['relations.ts', 'schema.ts']);
		} finally {
			await dsqlDb.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
		}
	});
});
