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
import { SchemaError } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';
import '../src/@types/utils';
import { PGlite } from '@electric-sql/pglite';
import { rmSync, writeFileSync } from 'fs';
import { fromDatabaseForDrizzle, pgPushIntrospect } from 'src/cli/commands/pull-postgres';
import { suggestions } from 'src/cli/commands/push-postgres';
import { Entities } from 'src/cli/validations/cli';
import { fromDatabase } from 'src/dialects/postgres/introspect';
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

export const diffTestSchemas = async (
	left: PostgresSchema,
	right: PostgresSchema,
	renamesArr: string[],
	cli: boolean = false,
	casing?: CasingType | undefined,
) => {
	const leftTables = Object.values(left).filter((it) => is(it, PgTable)) as PgTable[];
	const rightTables = Object.values(right).filter((it) => is(it, PgTable)) as PgTable[];

	const leftSchemas = Object.values(left).filter((it) => is(it, PgSchema)) as PgSchema[];
	const rightSchemas = Object.values(right).filter((it) => is(it, PgSchema)) as PgSchema[];

	const leftEnums = Object.values(left).filter((it) => isPgEnum(it)) as PgEnum<any>[];
	const rightEnums = Object.values(right).filter((it) => isPgEnum(it)) as PgEnum<any>[];

	const leftSequences = Object.values(left).filter((it) => isPgSequence(it)) as PgSequence[];
	const rightSequences = Object.values(right).filter((it) => isPgSequence(it)) as PgSequence[];

	const leftRoles = Object.values(left).filter((it) => is(it, PgRole)) as PgRole[];
	const rightRoles = Object.values(right).filter((it) => is(it, PgRole)) as PgRole[];

	const leftPolicies = Object.values(left).filter((it) => is(it, PgPolicy)) as PgPolicy[];
	const rightPolicies = Object.values(right).filter((it) => is(it, PgPolicy)) as PgPolicy[];

	const leftViews = Object.values(left).filter((it) => isPgView(it)) as PgView[];
	const rightViews = Object.values(right).filter((it) => isPgView(it)) as PgView[];

	const leftMaterializedViews = Object.values(left).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];
	const rightMaterializedViews = Object.values(right).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const { schema: schemaLeft } = fromDrizzleSchema(
		leftSchemas,
		leftTables,
		leftEnums,
		leftSequences,
		leftRoles,
		leftPolicies,
		leftViews,
		leftMaterializedViews,
		casing,
	);

	const { schema: schemaRight, errors: errorsRight, warnings } = fromDrizzleSchema(
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

	if (errorsRight.length) {
		throw new Error();
	}
	const { ddl: ddl1, errors: err1 } = interimToDDL(schemaLeft);
	const { ddl: ddl2, errors: err2 } = interimToDDL(schemaRight);

	if (err1.length > 0 || err2.length > 0) {
		throw new MockError([...err1, ...err2]);
	}

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements, groupedStatements, errors } = await ddlDiff(
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
		return { sqlStatements, statements, groupedStatements, errors };
	}

	const { sqlStatements, statements, groupedStatements, errors } = await ddlDiff(
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
	return { sqlStatements, statements, groupedStatements, errors };
};

export const diffTestSchemasPush = async (
	client: PGlite,
	left: PostgresSchema,
	right: PostgresSchema,
	renamesArr: string[],
	cli: boolean = false,
	schemas: string[] = ['public'],
	casing?: CasingType | undefined,
	entities?: Entities,
	sqlStatementsToRun: {
		before?: string[];
		after?: string[];
		runApply?: boolean;
	} = {
		before: [],
		after: [],
		runApply: true,
	},
) => {
	const shouldRunApply = sqlStatementsToRun.runApply === undefined
		? true
		: sqlStatementsToRun.runApply;

	for (const st of sqlStatementsToRun.before ?? []) {
		await client.query(st);
	}

	if (shouldRunApply) {
		const { sqlStatements } = await applyPgDiffs(left, casing);
		for (const st of sqlStatements) {
			await client.query(st);
		}
	}

	for (const st of sqlStatementsToRun.after ?? []) {
		await client.query(st);
	}

	const materializedViewsForRefresh = Object.values(left).filter((it) =>
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

	// do introspect into PgSchemaInternal
	const introspectedSchema = await fromDatabase(db, undefined, (it) => schemas.indexOf(it) >= 0, entities);

	const leftTables = Object.values(right).filter((it) => is(it, PgTable)) as PgTable[];
	const leftSchemas = Object.values(right).filter((it) => is(it, PgSchema)) as PgSchema[];
	const leftEnums = Object.values(right).filter((it) => isPgEnum(it)) as PgEnum<any>[];
	const leftSequences = Object.values(right).filter((it) => isPgSequence(it)) as PgSequence[];
	const leftRoles = Object.values(right).filter((it) => is(it, PgRole)) as PgRole[];
	const leftPolicies = Object.values(right).filter((it) => is(it, PgPolicy)) as PgPolicy[];
	const leftViews = Object.values(right).filter((it) => isPgView(it)) as PgView[];
	const leftMaterializedViews = Object.values(right).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const { schema, errors: err1, warnings } = fromDrizzleSchema(
		leftSchemas,
		leftTables,
		leftEnums,
		leftSequences,
		leftRoles,
		leftPolicies,
		leftViews,
		leftMaterializedViews,
		casing,
	);
	const { ddl: ddl1, errors: err2 } = interimToDDL(schema);
	const { ddl: ddl2, errors: err3 } = interimToDDL(introspectedSchema);

	// TODO: handle errors

	const renames = new Set(renamesArr);
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

		const {
			hints,
			statements: nextStatements,
		} = await suggestions(db, statements);

		return { sqlStatements: nextStatements, hints };
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
	client: PGlite,
	initSchema: PostgresSchema,
	testName: string,
	schemas: string[] = ['public'],
	entities?: Entities,
	casing?: CasingType | undefined,
) => {
	// put in db
	const { sqlStatements } = await applyPgDiffs(initSchema, casing);
	for (const st of sqlStatements) {
		await client.query(st);
	}

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(
		{
			query: async (query: string, values?: any[] | undefined) => {
				const res = await client.query(query, values);
				return res.rows as any[];
			},
		},
		(_) => true,
		(it) => schemas.indexOf(it) >= 0,
		entities,
	);

	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, 'camel');

	writeFileSync(`tests/introspect/postgres/${testName}.ts`, file.file);

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([
		`tests/introspect/postgres/${testName}.ts`,
	]);

	const { schema: schema2, errors: e2, warnings } = fromDrizzleSchema(
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
		createDDL(),
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

	rmSync(`tests/introspect/postgres/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};
