import { is } from 'drizzle-orm';
import { MsSqlSchema, MsSqlTable, MsSqlView } from 'drizzle-orm/mssql-core';
import { CasingType } from 'src/cli/validations/common';
import { interimToDDL, SchemaError } from 'src/dialects/mssql/ddl';
import { ddlDiff } from 'src/dialects/mssql/diff';
import { fromDrizzleSchema } from 'src/dialects/mssql/drizzle';
import { mockResolver } from 'src/utils/mocks';
import '../../src/@types/utils';

export type mssqlSchema = Record<
	string,
	| MsSqlTable<any>
	| MsSqlSchema
	| MsSqlView
>;

class MockError extends Error {
	constructor(readonly errors: SchemaError[]) {
		super();
	}
}

export const drizzleToDDL = (
	schema: mssqlSchema,
	casing?: CasingType | undefined,
) => {
	const tables = Object.values(schema).filter((it) => is(it, MsSqlTable)) as MsSqlTable[];
	const schemas = Object.values(schema).filter((it) => is(it, MsSqlSchema)) as MsSqlSchema[];
	const views = Object.values(schema).filter((it) => is(it, MsSqlView)) as MsSqlView[];

	const res = fromDrizzleSchema(
		{ schemas, tables, views },
		casing,
	);

	// if (errors.length > 0) {
	// 	throw new Error();
	// }

	return interimToDDL(res);
};

// 2 schemas -> 2 ddls -> diff
export const diff = async (
	left: mssqlSchema,
	right: mssqlSchema,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = drizzleToDDL(left, casing);
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
		mockResolver(renames), // uniques
		mockResolver(renames), // indexes
		mockResolver(renames), // checks
		mockResolver(renames), // pks
		mockResolver(renames), // fks
		'default',
	);
	return { sqlStatements, statements, groupedStatements };
};

// init schema flush to db -> introspect db to ddl -> compare ddl with destination schema
// export const diffPush = async (config: {
// 	client: PGlite;
// 	init: mssqlSchema;
// 	destination: mssqlSchema;
// 	renames?: string[];
// 	schemas?: string[];
// 	casing?: CasingType;
// 	entities?: Entities;
// 	before?: string[];
// 	after?: string[];
// 	apply?: boolean;
// }) => {
// 	const { client, init: initSchema, destination, casing, before, after, renames: rens, entities } = config;
// 	const schemas = config.schemas ?? ['public'];
// 	const apply = config.apply ?? true;
// 	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
// 	const { sqlStatements: inits } = await ddlDiffDry(createDDL(), initDDL, 'default');

// 	const init = [] as string[];
// 	if (before) init.push(...before);
// 	if (apply) init.push(...inits);
// 	if (after) init.push(...after);
// 	const mViewsRefreshes = initDDL.views.list({ materialized: true }).map((it) =>
// 		`REFRESH MATERIALIZED VIEW "${it.schema}"."${it.name}"${it.withNoData ? ' WITH NO DATA;' : ';'};`
// 	);
// 	init.push(...mViewsRefreshes);

// 	for (const st of init) {
// 		await client.query(st);
// 	}

// 	const db = {
// 		query: async (query: string, values?: any[] | undefined) => {
// 			const res = await client.query(query, values);
// 			return res.rows as any[];
// 		},
// 	};

// 	// do introspect into PgSchemaInternal
// 	const introspectedSchema = await fromDatabaseForDrizzle(db, undefined, (it) => schemas.indexOf(it) >= 0, entities);

// 	const { ddl: ddl1, errors: err3 } = interimToDDL(introspectedSchema);
// 	const { ddl: ddl2, errors: err2 } = drizzleToDDL(destination, casing);

// 	// TODO: handle errors

// 	const renames = new Set(rens);
// 	const { sqlStatements, statements } = await ddlDiff(
// 		ddl1,
// 		ddl2,
// 		mockResolver(renames),
// 		mockResolver(renames),
// 		mockResolver(renames),
// 		mockResolver(renames),
// 		mockResolver(renames),
// 		mockResolver(renames),
// 		mockResolver(renames),
// 		mockResolver(renames), // views
// 		mockResolver(renames), // uniques
// 		mockResolver(renames), // indexes
// 		mockResolver(renames), // checks
// 		mockResolver(renames), // pks
// 		mockResolver(renames), // fks
// 		'push',
// 	);

// 	const { hints, losses } = await suggestions(
// 		db,
// 		statements,
// 	);
// 	return { sqlStatements, statements, hints, losses };
// };

// export const reset = async (client: PGlite) => {
// 	const namespaces = await client.query<{ name: string }>('select oid, nspname as name from pg_namespace').then((
// 		res,
// 	) => res.rows.filter((r) => !isSystemNamespace(r.name)));

// 	const roles = await client.query<{ rolname: string }>(
// 		`SELECT rolname, rolinherit, rolcreatedb, rolcreaterole FROM pg_roles;`,
// 	).then((it) => it.rows.filter((it) => !isSystemRole(it.rolname)));

// 	for (const namespace of namespaces) {
// 		await client.query(`DROP SCHEMA "${namespace.name}" cascade`);
// 	}

// 	await client.query('CREATE SCHEMA public;');

// 	for (const role of roles) {
// 		await client.query(`DROP ROLE "${role.rolname}"`);
// 	}
// };

// init schema to db -> pull from db to file -> ddl from files -> compare ddl from db with ddl from file
// export const diffIntrospect = async (
// 	db: PGlite,
// 	initSchema: mssqlSchema,
// 	testName: string,
// 	schemas: string[] = ['public'],
// 	entities?: Entities,
// 	casing?: CasingType | undefined,
// ) => {
// 	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
// 	const { sqlStatements: init } = await ddlDiffDry(createDDL(), initDDL, 'default');
// 	for (const st of init) await db.query(st);

// 	// introspect to schema
// 	const schema = await fromDatabaseForDrizzle(
// 		{
// 			query: async (query: string, values?: any[] | undefined) => {
// 				const res = await db.query(query, values);
// 				return res.rows as any[];
// 			},
// 		},
// 		(_) => true,
// 		(it) => schemas.indexOf(it) >= 0,
// 		entities,
// 	);
// 	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

// 	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel', 'pg');
// 	writeFileSync(`tests/mssql/tmp/${testName}.ts`, file.file);

// 	// generate snapshot from ts file
// 	const response = await prepareFromSchemaFiles([
// 		`tests/mssql/tmp/${testName}.ts`,
// 	]);

// 	const {
// 		schema: schema2,
// 		errors: e2,
// 		warnings,
// 	} = fromDrizzleSchema(response, casing);
// 	const { ddl: ddl2, errors: e3 } = interimToDDL(schema2);
// 	// TODO: handle errors

// 	const {
// 		sqlStatements: afterFileSqlStatements,
// 		statements: afterFileStatements,
// 	} = await ddlDiffDry(ddl1, ddl2, 'push');

// 	rmSync(`tests/mssql/tmp/${testName}.ts`);

// 	return {
// 		sqlStatements: afterFileSqlStatements,
// 		statements: afterFileStatements,
// 	};
// };
