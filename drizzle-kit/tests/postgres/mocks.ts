import { is } from 'drizzle-orm';
import {
	isPgEnum,
	isPgMaterializedView,
	isPgSequence,
	isPgView,
	PgEnum,
	PgMaterializedView,
	PgPolicy,
	PgRole,
	PgSchema,
	PgSequence,
	PgTable,
	PgView,
} from 'drizzle-orm/pg-core';
import { CasingType } from 'src/cli/validations/common';
import { createDDL, interimToDDL } from 'src/dialects/postgres/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/postgres/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/postgres/drizzle';
import { SchemaError } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';
import '../../src/@types/utils';
import { PGlite } from '@electric-sql/pglite';
import { rmSync, writeFileSync } from 'fs';
import { suggestions } from 'src/cli/commands/push-postgres';
import { Entities } from 'src/cli/validations/cli';
import { isSystemNamespace, isSystemRole } from 'src/dialects/postgres/grammar';
import { fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { ddlToTypeScript } from 'src/dialects/postgres/typescript';

export type PostgresSchema = Record<
	string,
	| PgTable<any>
	| PgEnum<any>
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
		schemas,
		tables,
		enums,
		sequences,
		roles,
		policies,
		views,
		materializedViews,
		casing,
	);

	if (errors.length > 0) {
		throw new Error();
	}

	return interimToDDL(res);
};

export const diff = async (
	left: PostgresSchema,
	right: PostgresSchema,
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

export const diffTestSchemasPush = async (config: {
	client: PGlite;
	init: PostgresSchema;
	destination: PostgresSchema;
	renames?: string[];
	schemas?: string[];
	casing?: CasingType;
	entities?: Entities;
	before?: string[];
	after?: string[];
	apply?: boolean;
}) => {
	const { client, init: initSchema, destination, casing, before, after, renames: rens, entities } = config;
	const schemas = config.schemas ?? ['public'];
	const apply = config.apply ?? true;
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
		await client.query(st);
	}

	const db = {
		query: async (query: string, values?: any[] | undefined) => {
			const res = await client.query(query, values);
			return res.rows as any[];
		},
	};

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

export const reset = async (client: PGlite) => {
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
};

export const pushPullDiff = async (
	db: PGlite,
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
	const schema = await fromDatabaseForDrizzle(
		{
			query: async (query: string, values?: any[] | undefined) => {
				const res = await db.query(query, values);
				return res.rows as any[];
			},
		},
		(_) => true,
		(it) => schemas.indexOf(it) >= 0,
		entities,
	);
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel');
	writeFileSync(`tests/postgres/tmp/${testName}.ts`, file.file);

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([
		`tests/postgres/tmp/${testName}.ts`,
	]);

	const {
		schema: schema2,
		errors: e2,
		warnings,
	} = fromDrizzleSchema(
		response.schemas,
		response.tables,
		response.enums,
		response.sequences,
		response.roles,
		response.policies,
		response.views,
		response.matViews,
		casing,
	);
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
