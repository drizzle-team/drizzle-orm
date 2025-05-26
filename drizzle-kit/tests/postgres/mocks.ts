import { ColumnBuilder, is, SQL } from 'drizzle-orm';
import {
	AnyPgColumn,
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
import { CasingType } from 'src/cli/validations/common';
import { createDDL, interimToDDL, PostgresDDL, SchemaError } from 'src/dialects/postgres/ddl';
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
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite/vector';
import { rmSync, writeFileSync } from 'fs';
import { introspect } from 'src/cli/commands/pull-postgres';
import { suggestions } from 'src/cli/commands/push-postgres';
import { Entities } from 'src/cli/validations/cli';
import { EmptyProgressView } from 'src/cli/views';
import { defaultToSQL, isSystemNamespace, isSystemRole } from 'src/dialects/postgres/grammar';
import { fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { ddlToTypeScript } from 'src/dialects/postgres/typescript';
import { DB } from 'src/utils';

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
>;

class MockError extends Error {
	constructor(readonly errors: SchemaError[]) {
		super();
	}
}

export const drizzleToDDL = (
	schema: PostgresSchema,
	casing?: CasingType | undefined,
) => {
	const tables = Object.values(schema).filter((it) => is(it, PgTable)) as PgTable[];
	const schemas = Object.values(schema).filter((it) => is(it, PgSchema)) as PgSchema[];
	const enums = Object.values(schema).filter((it) => isPgEnum(it)) as PgEnum<any>[];
	const sequences = Object.values(schema).filter((it) => isPgSequence(it)) as PgSequence[];
	const roles = Object.values(schema).filter((it) => is(it, PgRole)) as PgRole[];
	const policies = Object.values(schema).filter((it) => is(it, PgPolicy)) as PgPolicy[];
	const views = Object.values(schema).filter((it) => isPgView(it)) as PgView[];
	const materializedViews = Object.values(schema).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const {
		schema: res,
		errors,
		warnings,
	} = fromDrizzleSchema(
		{ schemas, tables, enums, sequences, roles, policies, views, matViews: materializedViews },
		casing,
	);

	if (errors.length > 0) {
		throw new Error();
	}

	return interimToDDL(res);
};

// 2 schemas -> 2 ddls -> diff
export const diff = async (
	left: PostgresSchema | PostgresDDL,
	right: PostgresSchema,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = 'entities' in left && '_' in left
		? { ddl: left as PostgresDDL, errors: [] }
		: drizzleToDDL(left, casing);
	const { ddl: ddl2, errors: err2 } = drizzleToDDL(right, casing);

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
		mockResolver(renames), // uniques
		mockResolver(renames), // indexes
		mockResolver(renames), // checks
		mockResolver(renames), // pks
		mockResolver(renames), // fks
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
	casing?: CasingType;
	log?: 'statements' | 'none';
	entities?: Entities;
}) => {
	const { db, to } = config;
	const log = config.log ?? 'none';
	const casing = config.casing ?? 'camelCase';
	const schemas = config.schemas ?? ((_: string) => true);

	const { schema } = await introspect(db, [], schemas, config.entities, new EmptyProgressView());
	const { ddl: ddl1, errors: err3 } = interimToDDL(schema);
	const { ddl: ddl2, errors: err2 } = 'entities' in to && '_' in to
		? { ddl: to as PostgresDDL, errors: [] }
		: drizzleToDDL(to, casing);

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

	if (log === 'statements') {
		// console.dir(ddl1.roles.list());
		// console.dir(ddl2.roles.list());
	}

	// writeFileSync("./ddl1.json", JSON.stringify(ddl1.entities.list()))
	// writeFileSync("./ddl2.json", JSON.stringify(ddl2.entities.list()))

	// TODO: handle errors

	const renames = new Set(config.renames ?? []);
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
		mockResolver(renames), // views
		mockResolver(renames), // uniques
		mockResolver(renames), // indexes
		mockResolver(renames), // checks
		mockResolver(renames), // pks
		mockResolver(renames), // fks
		'push',
	);

	const { hints, losses } = await suggestions(db, statements);

	for (const sql of sqlStatements) {
		if (log === 'statements') console.log(sql);
		await db.query(sql);
	}

	return { sqlStatements, statements, hints, losses };
};

export const diffPush = async (config: {
	db: DB;
	from: PostgresSchema;
	to: PostgresSchema;
	renames?: string[];
	schemas?: string[];
	casing?: CasingType;
	entities?: Entities;
	before?: string[];
	after?: string[];
	apply?: boolean;
}) => {
	const { db, from: initSchema, to: destination, casing, before, after, renames: rens, entities } = config;

	const schemas = config.schemas ?? ['public'];
	const apply = typeof config.apply === 'undefined' ? true : config.apply;
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: inits } = await ddlDiffDry(createDDL(), initDDL, 'default');

	const init = [] as string[];
	if (before) init.push(...before);
	if (apply) init.push(...inits);
	if (after) init.push(...after);
	const mViewsRefreshes = initDDL.views.list({ materialized: true }).map((it) =>
		`REFRESH MATERIALIZED VIEW "${it.schema}"."${it.name}"${it.withNoData ? ' WITH NO DATA;' : ';'};`
	);
	init.push(...mViewsRefreshes);

	for (const st of init) {
		await db.query(st);
	}

	// do introspect into PgSchemaInternal
	const introspectedSchema = await fromDatabaseForDrizzle(db, undefined, (it) => schemas.indexOf(it) >= 0, entities);

	const { ddl: ddl1, errors: err3 } = interimToDDL(introspectedSchema);
	const { ddl: ddl2, errors: err2 } = drizzleToDDL(destination, casing);

	// TODO: handle errors

	const renames = new Set(rens);
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
		mockResolver(renames), // views
		mockResolver(renames), // uniques
		mockResolver(renames), // indexes
		mockResolver(renames), // checks
		mockResolver(renames), // pks
		mockResolver(renames), // fks
		'push',
	);

	const { hints, losses } = await suggestions(
		db,
		statements,
	);
	return { sqlStatements, statements, hints, losses };
};

// init schema to db -> pull from db to file -> ddl from files -> compare ddl from db with ddl from file
export const diffIntrospect = async (
	db: DB,
	initSchema: PostgresSchema,
	testName: string,
	schemas: string[] = ['public'],
	entities?: Entities,
	casing?: CasingType | undefined,
) => {
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: init } = await ddlDiffDry(createDDL(), initDDL, 'default');
	for (const st of init) await db.query(st);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, (_) => true, (it) => schemas.indexOf(it) >= 0, entities);
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel', 'pg');
	writeFileSync(`tests/postgres/tmp/${testName}.ts`, file.file);

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([
		`tests/postgres/tmp/${testName}.ts`,
	]);

	const {
		schema: schema2,
		errors: e2,
		warnings,
	} = fromDrizzleSchema(response, casing);
	const { ddl: ddl2, errors: e3 } = interimToDDL(schema2);
	// TODO: handle errors

	const {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	} = await ddlDiffDry(ddl1, ddl2, 'push');

	rmSync(`tests/postgres/tmp/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};

export const diffDefault = async <T extends PgColumnBuilder>(
	kit: TestDatabase,
	builder: T,
	def: T['_']['data'] | SQL<unknown>,
	expectedDefault: string,
) => {
	await kit.clear();

	const table1 = pgTable('table', { column: builder });
	const table2 = pgTable('table', { column: builder.default(def as any) });

	const { baseColumn, dimensions, sqlType, sqlBaseType, typeSchema } = unwrapColumn(table2.column);
	const columnDefault = defaultFromColumn(baseColumn, table2.column.default, dimensions, new PgDialect());
	const defaultSql = defaultToSQL({
		default: columnDefault,
		type: sqlBaseType,
		dimensions,
		typeSchema: typeSchema,
	});

	const res = [] as string[];
	if (defaultSql !== expectedDefault) {
		res.push(`Unexpected sql: ${defaultSql} | ${expectedDefault}`);
	}
	const init = {
		table2,
	};

	const { db, clear } = kit;
	const { sqlStatements: st1 } = await push({ db, to: init });
	const { sqlStatements: st2 } = await push({ db, to: init });

	const expectedInit = `CREATE TABLE "table" (\n\t"column" ${sqlType} DEFAULT ${expectedDefault}\n);\n`;
	if (st1.length !== 1 || st1[0] !== expectedInit) res.push(`Unexpected init:\n${st1}\n\n${expectedInit}`);
	if (st2.length > 0) res.push(`Unexpected subsequent init:\n${st2}`);

	await clear();

	const schema1 = {
		table1,
	};
	const schema2 = {
		table2,
	};

	await push({ db, to: schema1 });
	const { sqlStatements: st3 } = await push({ db, to: schema2 });
	const expectedAlter = `ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT ${expectedDefault};`;
	if (st3.length !== 1 || st3[0] !== expectedAlter) res.push(`Unexpected default alter:\n${st3}\n\n${expectedAlter}`);

	await clear();
	const schema3 = {
		table: pgTable('table', { id: serial() }),
	};
	const schema4 = {
		table: pgTable('table', { id: serial(), column: builder.default(def as any) }),
	};

	await push({ db, to: schema3 });
	const { sqlStatements: st4 } = await push({ db, to: schema4 });

	const expectedAddColumn = `ALTER TABLE "table" ADD COLUMN "column" ${sqlType} DEFAULT ${expectedDefault};`;
	if (st4.length !== 1 || st4[0] !== expectedAddColumn) {
		res.push(`Unexpected add column:\n${st4[0]}\n\n${expectedAddColumn}`);
	}
	
	return res;
};

export type TestDatabase = {
	db: DB & { batch: (sql: string[]) => Promise<void> };
	close: () => Promise<void>;
	clear: () => Promise<void>;
};

export const prepareTestDatabase = async (): Promise<TestDatabase> => {
	const client = new PGlite({ extensions: { vector, pg_trgm } });
	await client.query(`CREATE ACCESS METHOD drizzle_heap TYPE TABLE HANDLER heap_tableam_handler;`);

	const clear = async () => {
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

	const db: TestDatabase['db'] = {
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
	return { db, close: async () => {}, clear };
};
