import { is } from 'drizzle-orm';
import {
	getMaterializedViewConfig,
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
import { resolver } from 'src/cli/prompts';
import { CasingType } from 'src/cli/validations/common';
import {
	Column,
	createDDL,
	Enum,
	interimToDDL,
	Policy,
	PostgresEntities,
	Role,
	Schema,
	Sequence,
	View,
} from 'src/dialects/postgres/ddl';
import { ddlDiff } from 'src/dialects/postgres/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/postgres/drizzle';
import { DB, SchemaError } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';
import '../../src/@types/utils';
import { PGlite } from '@electric-sql/pglite';
import { rmSync, writeFileSync } from 'fs';
import { suggestions } from 'src/cli/commands/push-postgres';
import { Entities } from 'src/cli/validations/cli';
import { fromDatabase, fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { ddlToTypeScript } from 'src/dialects/postgres/typescript';
import { S } from 'vitest/dist/reporters-yx5ZTtEV';
import { isSystemNamespace, isSystemRole } from 'src/dialects/postgres/grammar';

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

export const diffTestSchemas = async (
	left: PostgresSchema,
	right: PostgresSchema,
	renamesArr: string[],
	cli: boolean = false,
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = drizzleToDDL(left, casing);
	const { ddl: ddl2, errors: err2 } = drizzleToDDL(right, casing);

	if (err1.length > 0 || err2.length > 0) {
		throw new MockError([...err1, ...err2]);
	}

	const renames = new Set(renamesArr);

	if (!cli) {
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
	}

	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		resolver<Schema>('schema'),
		resolver<Enum>('enum'),
		resolver<Sequence>('sequence'),
		resolver<Policy>('policy'),
		resolver<Role>('role'),
		resolver<PostgresEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		// TODO: handle renames?
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
	cli?: boolean;
}) => {
	const { client, init: initSchema, destination, casing, before, after, renames: rens, cli, entities } = config;
	const schemas = config.schemas ?? ['public'];
	const apply = config.apply ?? true;

	const init = [] as string[];
	if (before) init.push(...before);
	if (apply) init.push(...(await applyPgDiffs(initSchema, casing)).sqlStatements);
	if (after) init.push(...after);

	for (const st of init) {
		await client.query(st);
	}

	const materializedViewsForRefresh = Object.values(initSchema).filter((it) =>
		isPgMaterializedView(it)
	) as PgMaterializedView[];

	// refresh all mat views
	for (const view of materializedViewsForRefresh) {
		const viewConf = getMaterializedViewConfig(view);
		if (viewConf.isExisting) continue;

		await client.exec(
			`REFRESH MATERIALIZED VIEW "${viewConf.schema ?? 'public'}"."${viewConf.name}"${
				viewConf.withNoData ? ' WITH NO DATA;' : ';'
			}`,
		);
	}

	const db = {
		query: async (query: string, values?: any[] | undefined) => {
			const res = await client.query(query, values);
			return res.rows as any[];
		},
	};

	const rightTables = Object.values(destination).filter((it) => is(it, PgTable)) as PgTable[];
	const rightSchemas = Object.values(destination).filter((it) => is(it, PgSchema)) as PgSchema[];
	const rightEnums = Object.values(destination).filter((it) => isPgEnum(it)) as PgEnum<any>[];
	const rightSequences = Object.values(destination).filter((it) => isPgSequence(it)) as PgSequence[];
	const rightRoles = Object.values(destination).filter((it) => is(it, PgRole)) as PgRole[];
	const rightPolicies = Object.values(destination).filter((it) => is(it, PgPolicy)) as PgPolicy[];
	const rightViews = Object.values(destination).filter((it) => isPgView(it)) as PgView[];
	const rightMaterializedViews = Object.values(destination).filter((it) =>
		isPgMaterializedView(it)
	) as PgMaterializedView[];

	// do introspect into PgSchemaInternal
	const introspectedSchema = await fromDatabaseForDrizzle(
		db,
		undefined,
		(it) => schemas.indexOf(it) >= 0,
		entities,
	);

	const { ddl: ddl1, errors: err3 } = interimToDDL(introspectedSchema);

	const {
		schema,
		errors: err1,
		warnings,
	} = fromDrizzleSchema(
		rightSchemas,
		rightTables,
		rightEnums,
		rightSequences,
		rightRoles,
		rightPolicies,
		rightViews,
		rightMaterializedViews,
		casing,
	);
	const { ddl: ddl2, errors: err2 } = interimToDDL(schema);

	// TODO: handle errors

	const renames = new Set(rens);
	if (!cli) {
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
	} else {
		const blanks = new Set<string>();
		const { sqlStatements, statements } = await ddlDiff(
			ddl1,
			ddl2,
			resolver<Schema>('schema'),
			resolver<Enum>('enum'),
			resolver<Sequence>('sequence'),
			resolver<Policy>('policy'),
			resolver<Role>('role'),
			resolver<PostgresEntities['tables']>('table'),
			resolver<Column>('column'),
			resolver<View>('view'),
			// TODO: handle all renames
			mockResolver(blanks), // uniques
			mockResolver(blanks), // indexes
			mockResolver(blanks), // checks
			mockResolver(blanks), // pks
			mockResolver(blanks), // fks
			'push',
		);
		return { sqlStatements, statements };
	}
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

export const applyPgDiffs = async (
	sn: PostgresSchema,
	casing: CasingType | undefined,
) => {
	const tables = Object.values(sn).filter((it) => is(it, PgTable)) as PgTable[];
	const schemas = Object.values(sn).filter((it) => is(it, PgSchema)) as PgSchema[];
	const enums = Object.values(sn).filter((it) => isPgEnum(it)) as PgEnum<any>[];
	const sequences = Object.values(sn).filter((it) => isPgSequence(it)) as PgSequence[];
	const roles = Object.values(sn).filter((it) => is(it, PgRole)) as PgRole[];
	const views = Object.values(sn).filter((it) => isPgView(it)) as PgView[];
	const policies = Object.values(sn).filter((it) => is(it, PgPolicy)) as PgPolicy[];
	const materializedViews = Object.values(sn).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const { schema } = fromDrizzleSchema(
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

	const { ddl, errors: e1 } = interimToDDL(schema);

	// TODO: handle errors
	const renames = new Set<string>();

	const { sqlStatements, statements } = await ddlDiff(
		createDDL(),
		ddl,
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
	return { sqlStatements, statements };
};

export const introspectPgToFile = async (
	db: PGlite,
	initSchema: PostgresSchema,
	testName: string,
	schemas: string[] = ['public'],
	entities?: Entities,
	casing?: CasingType | undefined,
) => {
	// put in db
	const { sqlStatements } = await applyPgDiffs(initSchema, casing);
	for (const st of sqlStatements) {
		await db.query(st);
	}

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

	const file = ddlToTypeScript(ddl1, 'camel');
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
	const renames = new Set<string>();

	const {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	} = await ddlDiff(
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
		'push',
	);

	rmSync(`tests/postgres/tmp/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};
