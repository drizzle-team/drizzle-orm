import { is } from 'drizzle-orm';
import {
	getViewConfig,
	isPgEnum,
	isPgMaterializedView,
	isPgSequence,
	isPgView,
	PgColumnBuilder,
	PgDialect,
	PgEnum,
	PgEnumObject,
	PgMaterializedView,
	PgPolicy,
	PgRole,
	PgSchema,
	PgSequence,
	PgTable,
	pgTable,
	PgView,
	serial,
} from 'drizzle-orm/pg-core';
import {
	PgEnum as PgEnumOld,
	PgEnumObject as PgEnumObjectOld,
	PgMaterializedView as PgMaterializedViewOld,
	PgPolicy as PgPolicyOld,
	PgRole as PgRoleOld,
	PgSchema as PgSchemaOld,
	PgSequence as PgSequenceOld,
	PgTable as PgTableOld,
	PgView as PgViewOld,
} from 'orm044/pg-core';
import { CasingType, configMigrations } from 'src/cli/validations/common';
import { createDDL, fromEntities, interimToDDL, PostgresDDL, SchemaError } from 'src/dialects/postgres/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/postgres/diff';
import {
	defaultFromColumn,
	fromDrizzleSchema,
	prepareFromSchemaFiles,
	unwrapColumn,
} from 'src/dialects/postgres/drizzle';
import { mockResolver } from 'src/utils/mocks';
import '../../src/@types/utils';
import { PGlite } from '@electric-sql/pglite';
// @ts-ignore
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
// @ts-ignore
import { vector } from '@electric-sql/pglite/vector';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import pg from 'pg';
import { introspect } from 'src/cli/commands/pull-postgres';
import { suggestions } from 'src/cli/commands/push-postgres';
import { EmptyProgressView, explain, psqlExplain } from 'src/cli/views';
import { hash } from 'src/dialects/common';
import { defaultToSQL, isSystemNamespace, isSystemRole } from 'src/dialects/postgres/grammar';
import { fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { ddlToTypeScript } from 'src/dialects/postgres/typescript';
import { DB } from 'src/utils';
import 'zx/globals';
import { EntitiesFilter, EntitiesFilterConfig } from 'src/cli/validations/cli';
import { extractPostgresExisting } from 'src/dialects/drizzle';
import { getReasonsFromStatements } from 'src/dialects/postgres/commutativity';
import { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import { upToV8 } from 'src/dialects/postgres/versions';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { diff as legacyDiff } from 'src/legacy/postgres-v7/pgDiff';
import { serializePg } from 'src/legacy/postgres-v7/serializer';
import { tsc } from 'tests/utils';
import { expect } from 'vitest';

mkdirSync(`tests/postgres/tmp/`, { recursive: true });

const { Client } = pg;

export type PostgresSchema = Record<
	string,
	| PgTable<any>
	| PgEnum<any>
	| PgEnumObject<any>
	| PgSchema
	| PgSequence
	| PgView
	| PgMaterializedView
	| PgRole
	| PgPolicy
	| unknown
>;

export type PostgresSchemaOld = Record<
	string,
	| PgTableOld<any>
	| PgEnumOld<any>
	| PgEnumObjectOld<any>
	| PgSchemaOld
	| PgSequenceOld
	| PgViewOld
	| PgMaterializedViewOld
	| PgRoleOld
	| PgPolicyOld
	| unknown
>;

class MockError extends Error {
	constructor(readonly errors: SchemaError[]) {
		super();
	}
}

export const drizzleToDDL = (
	schema: PostgresSchema,
	casing?: CasingType | undefined,
	filtersConfig: EntitiesFilterConfig = {
		entities: undefined,
		extensions: undefined,
		schemas: undefined,
		tables: undefined,
	},
) => {
	const tables = Object.values(schema).filter((it) => is(it, PgTable)) as PgTable[];
	const schemas = Object.values(schema).filter((it) => is(it, PgSchema)) as PgSchema[];
	const enums = Object.values(schema).filter((it) => isPgEnum(it)) as PgEnum<any>[];
	const sequences = Object.values(schema).filter((it) => isPgSequence(it)) as PgSequence[];
	const roles = Object.values(schema).filter((it) => is(it, PgRole)) as PgRole[];
	const policies = Object.values(schema).filter((it) => is(it, PgPolicy)) as PgPolicy[];
	const views = Object.values(schema).filter((it) => isPgView(it)) as PgView[];
	const materializedViews = Object.values(schema).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const grouped = { schemas, tables, enums, sequences, roles, policies, views, matViews: materializedViews };

	const existing = extractPostgresExisting(schemas, views, materializedViews);
	const filter = prepareEntityFilter('postgresql', filtersConfig, existing);

	const {
		schema: res,
		errors,
		warnings,
	} = fromDrizzleSchema(grouped, casing, filter);

	if (errors.length > 0) {
		throw new Error();
	}

	return { ...interimToDDL(res), existing };
};

// 2 schemas -> 2 ddls -> diff
export const diff = async (
	left: PostgresSchema | PostgresDDL,
	right: PostgresSchema | PostgresDDL,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = 'entities' in left && '_' in left
		? { ddl: left as PostgresDDL, errors: [] }
		: drizzleToDDL(left, casing);
	const { ddl: ddl2, errors: err2 } = 'entities' in right && '_' in right
		? { ddl: right as PostgresDDL, errors: [] }
		: drizzleToDDL(right, casing);

	if (err1.length > 0 || err2.length > 0) {
		throw new MockError([...err1, ...err2]);
	}

	const renames = new Set(renamesArr);

	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'default',
	);
	return { sqlStatements, statements, groupedStatements, next: ddl2 };
};

// init schema flush to db -> introspect db to ddl -> compare ddl with destination schema
export const push = async (config: {
	db: DB;
	to: PostgresSchema | PostgresDDL;
	renames?: string[];
	schemas?: string[];
	tables?: string[];
	casing?: CasingType;
	log?: 'statements' | 'none';
	entities?: EntitiesFilter;
	ignoreSubsequent?: boolean;
	explain?: true;
	migrationsConfig?: {
		schema?: string;
		table?: string;
	};
}) => {
	const { db, to } = config;

	const log = config.log ?? 'none';
	const casing = config.casing;
	const schemas = config.schemas ?? [];
	const tables = config.tables ?? [];

	const migrations = configMigrations.parse(config.migrationsConfig);

	const filterConfig = {
		tables,
		schemas,
		entities: config.entities,
		extensions: [],
	};

	const { ddl: ddl2, errors: err2, existing } = 'entities' in to && '_' in to
		? { ddl: to as PostgresDDL, errors: [], existing: [] }
		: drizzleToDDL(to, casing, filterConfig);

	const filter = prepareEntityFilter('postgresql', filterConfig, existing);
	const { schema } = await introspect(
		db,
		filter,
		new EmptyProgressView(),
		() => {},
		migrations,
	);

	const { ddl: ddl1, errors: err3 } = interimToDDL(schema);

	if (err2.length > 0) {
		for (const e of err2) {
			console.error(`err2: ${JSON.stringify(e)}`);
		}
		throw new Error();
	}

	if (err3.length > 0) {
		for (const e of err3) {
			console.error(`err3: ${JSON.stringify(e)}`);
		}
		throw new Error();
	}

	const renames = new Set(config.renames ?? []);
	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'push',
	);

	const hints = await suggestions(db, statements);

	if (config.explain) {
		const explainMessage = explain('postgres', groupedStatements, false, []);
		console.log(explainMessage);
		return { sqlStatements, statements, hints };
	}

	for (const sql of sqlStatements) {
		if (log === 'statements') console.log(sql);
		await db.query(sql);
	}

	// subsequent push
	if (!config.ignoreSubsequent) {
		{
			const { schema } = await introspect(
				db,
				filter,
				new EmptyProgressView(),
				() => {},
				migrations,
			);
			const { ddl: ddl1, errors: err3 } = interimToDDL(schema);

			const { sqlStatements, statements } = await ddlDiff(
				ddl1,
				ddl2,
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				'push',
			);
			if (sqlStatements.length > 0) {
				console.error('---- subsequent push is not empty ----');
				expect(sqlStatements.join('\n')).toBe('');
			}
		}
	}

	return { sqlStatements, statements, hints };
};

// init schema to db -> pull from db to file -> ddl from files -> compare ddl from db with ddl from file
export const diffIntrospect = async (
	db: DB,
	initSchema: PostgresSchema,
	testName: string,
	schemas: string[] = ['public'],
	entities?: EntitiesFilter,
	casing?: CasingType | undefined,
) => {
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: init } = await ddlDiffDry(createDDL(), initDDL, 'default');
	for (const st of init) await db.query(st);

	const filter = prepareEntityFilter('postgresql', {
		tables: [],
		schemas,
		entities,
		extensions: [],
	}, []);
	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, filter, () => true, {
		schema: 'drizzle',
		table: '__drizzle_migrations',
	});
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const filePath = `tests/postgres/tmp/${testName}.ts`;
	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel', 'pg');
	writeFileSync(filePath, file.file);

	await tsc(file.file).catch((e) => {
		throw new Error(`tsc error in file ${filePath}`, { cause: e });
	});

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([
		filePath,
	]);

	const {
		schema: schema2,
		errors: e2,
		warnings,
	} = fromDrizzleSchema(response, casing, () => true);
	const { ddl: ddl2, errors: e3 } = interimToDDL(schema2);
	// TODO: handle errors

	const {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
		groupedStatements,
	} = await ddlDiffDry(ddl1, ddl2, 'push');

	if (afterFileSqlStatements.length > 0) {
		console.log(explain('postgres', groupedStatements, true, []));
	}

	rmSync(`tests/postgres/tmp/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
		ddlAfterPull: ddl1,
		schema2,
	};
};

export const diffDefault = async <T extends PgColumnBuilder>(
	kit: TestDatabase<any>,
	builder: T,
	expectedDefault: string,
	pre: PostgresSchema | null = null,
	override?: {
		type?: string;
		default?: string;
	},
	tablesFilter?: string[],
	schemasFilter?: string[],
) => {
	await kit.clear();

	const config = (builder as any).config;
	const def = config['default'];
	const column = pgTable('table', { column: builder }).column;
	const { dimensions, typeSchema, sqlType: sqlt } = unwrapColumn(column);

	const type = override?.type ?? sqlt.replace(', ', ',').replaceAll('[]', ''); // real(6, 3)->real(6,3)

	const columnDefault = defaultFromColumn(column, column.default, dimensions, new PgDialect());

	const defaultSql = defaultToSQL({
		default: columnDefault,
		type,
		dimensions,
		typeSchema: typeSchema,
	});

	const res = [] as string[];
	if (defaultSql !== expectedDefault) {
		res.push(`Unexpected sql: \n${defaultSql}\n${expectedDefault}`);
	}

	const init = {
		...pre,
		table: pgTable('table', { column: builder }),
	};

	const { db, clear } = kit;
	if (pre) await push({ db, to: pre, ignoreSubsequent: true });
	const { sqlStatements: st1 } = await push({
		db,
		to: init,
		tables: tablesFilter,
		schemas: schemasFilter,
		ignoreSubsequent: true,
	});
	const { sqlStatements: st2 } = await push({
		db,
		to: init,
		tables: tablesFilter,
		schemas: schemasFilter,
		ignoreSubsequent: true,
	});
	const typeSchemaPrefix = typeSchema && typeSchema !== 'public' ? `"${typeSchema}".` : '';
	const typeValue = typeSchema ? `"${type}"` : type;
	const sqlType = `${typeSchemaPrefix}${typeValue}${'[]'.repeat(dimensions)}`;
	const defaultStatement = expectedDefault ? ` DEFAULT ${expectedDefault}` : '';
	const expectedInit = `CREATE TABLE "table" (\n\t"column" ${sqlType}${defaultStatement}\n);\n`;
	if (st1.length !== 1 || st1[0] !== expectedInit) res.push(`Unexpected init:\n${st1}\n\n${expectedInit}`);
	if (st2.length > 0) res.push(`Unexpected subsequent init:\n${st2}`);

	await db.query('INSERT INTO "table" ("column") VALUES (default);');

	const filter = prepareEntityFilter('postgresql', {
		tables: tablesFilter ?? [],
		schemas: [],
		entities: undefined,
		extensions: [],
	}, []);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(
		db,
		filter ?? (() => true),
		schemasFilter ? (it: string) => schemasFilter.some((x) => x === it) : ((_) => true),
		{
			schema: 'drizzle',
			table: '__drizzle_migrations',
		},
	);
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel', 'pg');
	const path = `tests/postgres/tmp/temp-${hash(String(Math.random()))}.ts`;

	if (existsSync(path)) rmSync(path);
	writeFileSync(path, file.file);
	await tsc(file.file);

	const response = await prepareFromSchemaFiles([path]);
	const { schema: sch } = fromDrizzleSchema(response, 'camelCase', () => true);
	const { ddl: ddl2, errors: e3 } = interimToDDL(sch);

	const { sqlStatements: afterFileSqlStatements } = await ddlDiffDry(ddl1, ddl2, 'push');
	if (afterFileSqlStatements.length === 0) {
		rmSync(path);
	} else {
		res.push(`Unexpected diff after reading ts`);
		console.log(afterFileSqlStatements);
		console.log(`./${path}`);
	}

	await clear();

	config.hasDefault = false;
	config.default = undefined;
	const schema1 = {
		...pre,
		table: pgTable('table', { column: builder }),
	};

	config.hasDefault = true;
	config.default = def;
	const schema2 = {
		...pre,
		table: pgTable('table', { column: builder }),
	};

	if (pre) await push({ db, to: pre, tables: tablesFilter, schemas: schemasFilter, ignoreSubsequent: true });
	await push({ db, to: schema1, tables: tablesFilter, schemas: schemasFilter, ignoreSubsequent: true });
	const { sqlStatements: st3 } = await push({
		db,
		to: schema2,
		tables: tablesFilter,
		schemas: schemasFilter,
		ignoreSubsequent: true,
	});
	const expectedAlter = `ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT ${expectedDefault};`;
	if ((st3.length !== 1 || st3[0] !== expectedAlter) && expectedDefault) {
		res.push(`Unexpected default alter:\n${st3}\n\n${expectedAlter}`);
	}

	await clear();

	const schema3 = {
		...pre,
		table: pgTable('table', { id: serial() }),
	};

	const schema4 = {
		...pre,
		table: pgTable('table', { id: serial(), column: builder }),
	};

	if (pre) await push({ db, to: pre, tables: tablesFilter, schemas: schemasFilter, ignoreSubsequent: true });
	await push({ db, to: schema3, tables: tablesFilter, schemas: schemasFilter, ignoreSubsequent: true });
	const { sqlStatements: st4 } = await push({
		db,
		to: schema4,
		tables: tablesFilter,
		schemas: schemasFilter,
		ignoreSubsequent: true,
	});

	const expectedAddColumn = `ALTER TABLE "table" ADD COLUMN "column" ${sqlType}${defaultStatement};`;
	if (st4.length !== 1 || st4[0] !== expectedAddColumn) {
		res.push(`Unexpected add column:\n${st4[0]}\n\n${expectedAddColumn}`);
	}

	return res;
};

export const diffSnapshotV7 = async (db: DB, schema: PostgresSchema, schemaOld: PostgresSchemaOld) => {
	const res = await serializePg(schemaOld, 'camelCase');
	const { sqlStatements } = await legacyDiff({ right: res });

	for (const st of sqlStatements) {
		await db.query(st);
	}

	const { snapshot, hints } = upToV8(res);
	const ddl = fromEntities(snapshot.ddl);

	const { sqlStatements: st, next } = await diff(ddl, schema, []);
	const { sqlStatements: pst } = await push({ db, to: schema });
	const { sqlStatements: st1 } = await diff(next, schema, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema });

	return {
		step1: st,
		step2: pst,
		step3: st1,
		step4: pst1,
		all: [...st, ...pst, ...st1, ...pst1],
	};
};

export type TestDatabase<TClient = any> = {
	db: DB & { batch: (sql: string[]) => Promise<void> };
	client: TClient;
	close: () => Promise<void>;
	clear: () => Promise<void>;
};

const client = new PGlite({ extensions: { vector, pg_trgm } });

export const prepareTestDatabase = async (tx: boolean = true): Promise<TestDatabase<PGlite>> => {
	await client.query(`CREATE ACCESS METHOD drizzle_heap TYPE TABLE HANDLER heap_tableam_handler;`);
	await client.query(`CREATE EXTENSION vector;`);
	await client.query(`CREATE EXTENSION pg_trgm;`);
	if (tx) {
		await client.query('BEGIN');
		await client.query('SAVEPOINT drizzle');
	}

	const clear = async () => {
		if (tx) {
			await client.query('ROLLBACK TO SAVEPOINT drizzle');
			await client.query('BEGIN');
			await client.query('SAVEPOINT drizzle');
			return;
		}

		const namespaces = await client.query<{ name: string }>('select oid, nspname as name from pg_namespace').then((
			res,
		) => res.rows.filter((r) => !isSystemNamespace(r.name)));

		const roles = await client.query<{ rolname: string }>(
			`SELECT rolname, rolinherit, rolcreatedb, rolcreaterole FROM pg_roles;`,
		).then((it) => it.rows.filter((it) => !isSystemRole(it.rolname)));

		for (const namespace of namespaces) {
			await client.query(`DROP SCHEMA "${namespace.name}" cascade`);
		}

		await client.query('CREATE SCHEMA public;');

		for (const role of roles) {
			await client.query(`DROP ROLE "${role.rolname}"`);
		}

		await client.query(`CREATE EXTENSION vector;`);
		await client.query(`CREATE EXTENSION pg_trgm;`);
	};

	const db: TestDatabase<any>['db'] = {
		query: async (sql, params) => {
			return client.query(sql, params).then((it) => it.rows as any[]).catch((e: Error) => {
				const error = new Error(`query error: ${sql}\n\n${e.message}`);
				throw error;
			});
		},
		batch: async (sqls) => {
			for (const sql of sqls) {
				await client.query(sql);
			}
		},
	};
	return { db, close: async () => {}, clear, client };
};

export const preparePostgisTestDatabase = async (tx: boolean = true): Promise<TestDatabase<any>> => {
	const envURL = process.env.POSTGIS_URL;
	if (!envURL) {
		throw new Error('POSTGIS_URL is not set, starting a new Postgis container for tests...');
	}

	const parsed = new URL(envURL);
	parsed.pathname = '/postgres';

	const adminUrl = parsed.toString();
	const admin = new Client({ connectionString: adminUrl });
	await admin.connect();
	await admin!.query(`DROP DATABASE IF EXISTS drizzle;`);
	await admin!.query(`CREATE DATABASE drizzle;`);
	admin.end();

	const pgClient = new Client({ connectionString: envURL });
	await pgClient.connect();
	await pgClient!.query(`DROP ACCESS METHOD IF EXISTS drizzle_heap;`);
	await pgClient!.query(`CREATE ACCESS METHOD drizzle_heap TYPE TABLE HANDLER heap_tableam_handler;`);
	await pgClient!.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
	if (tx) {
		await pgClient!.query('BEGIN').catch();
		await pgClient!.query('SAVEPOINT drizzle');
	}

	const clear = async () => {
		if (tx) {
			await pgClient.query('ROLLBACK TO SAVEPOINT drizzle');
			await pgClient.query('BEGIN');
			await pgClient.query('SAVEPOINT drizzle');
			return;
		}

		const namespaces = await pgClient.query<{ name: string }>('select oid, nspname as name from pg_namespace').then((
			res,
		) => res.rows.filter((r) => !isSystemNamespace(r.name)));

		const roles = await pgClient.query<{ rolname: string }>(
			`SELECT rolname, rolinherit, rolcreatedb, rolcreaterole FROM pg_roles;`,
		).then((it) => it.rows.filter((it) => !isSystemRole(it.rolname)));

		for (const namespace of namespaces) {
			await pgClient.query(`DROP SCHEMA "${namespace.name}" cascade`);
		}

		await pgClient.query('CREATE SCHEMA public;');

		for (const role of roles) {
			await pgClient.query(`DROP ROLE "${role.rolname}"`);
		}

		await pgClient.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
	};

	const close = async () => {
		await pgClient.end().catch(console.error);
	};

	const db: TestDatabase['db'] = {
		query: async (sql, params) => {
			return pgClient.query(sql, params).then((it) => it.rows as any[]).catch((e: Error) => {
				const error = new Error(`query error: ${sql}\n\n${e.message}`);
				throw error;
			});
		},
		batch: async (sqls) => {
			for (const sql of sqls) {
				await pgClient.query(sql);
			}
		},
	};
	return { db, close, clear, client };
};

type SchemaShape = {
	id: string;
	prevId?: string;
	schema: Record<string, PgTable>;
};

export async function conflictsFromSchema(
	{ parent, child1, child2 }: {
		parent: SchemaShape;
		child1: SchemaShape;
		child2: SchemaShape;
	},
) {
	const parentInterim = fromDrizzleSchema(
		{
			tables: Object.values(parent.schema),
			schemas: [],
			enums: [],
			sequences: [],
			roles: [],
			policies: [],
			views: [],
			matViews: [],
		},
		undefined,
		() => true,
	);

	const parentSnapshot = {
		version: '8',
		dialect: 'postgres',
		id: parent.id,
		prevIds: parent.prevId ? [parent.prevId] : [],
		ddl: interimToDDL(parentInterim.schema).ddl.entities.list(),
		renames: [],
	} satisfies PostgresSnapshot;

	const { statements: st1 } = await diff(parent.schema, child1.schema, []);
	const { statements: st2 } = await diff(parent.schema, child2.schema, []);

	return await getReasonsFromStatements(st1, st2, parentSnapshot);
}
