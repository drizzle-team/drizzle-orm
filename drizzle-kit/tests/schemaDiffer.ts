import { PGlite } from '@electric-sql/pglite';
import { Client } from '@libsql/client/.';
import { Database } from 'better-sqlite3';
import { is } from 'drizzle-orm';
import { MySqlSchema, MySqlTable, MySqlView } from 'drizzle-orm/mysql-core';
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
import { SingleStoreSchema, SingleStoreTable } from 'drizzle-orm/singlestore-core';
import { SQLiteTable, SQLiteView } from 'drizzle-orm/sqlite-core';
import * as fs from 'fs';
import { Connection } from 'mysql2/promise';
import {
	columnsResolver,
	enumsResolver,
	indexesResolver,
	indPolicyResolver,
	mySqlViewsResolver,
	policyResolver,
	roleResolver,
	schemasResolver,
	sequencesResolver,
	sqliteViewsResolver,
	tablesResolver,
	uniqueResolver,
	viewsResolver,
} from 'src/cli/commands/migrate';
import { pgSuggestions } from 'src/cli/commands/pgPushUtils';
import { logSuggestionsAndReturn } from 'src/cli/commands/sqlitePushUtils';
import { Entities } from 'src/cli/validations/cli';
import { CasingType } from 'src/cli/validations/common';
import { schemaToTypeScript as schemaToTypeScriptMySQL } from 'src/introspect-mysql';
import { schemaToTypeScript } from 'src/dialects/postgres/introspect-pg';
import { schemaToTypeScript as schemaToTypeScriptSingleStore } from 'src/introspect-singlestore';
import { schemaToTypeScript as schemaToTypeScriptSQLite } from 'src/dialects/sqlite/introspect-sqlite';
import { prepareFromMySqlImports } from 'src/serializer/mysqlImports';
import { mysqlSchema, squashMysqlScheme, ViewSquashed } from 'src/serializer/mysqlSchema';
import { fromDatabase as fromMySqlDatabase, generateMySqlSnapshot } from 'src/serializer/mysqlSerializer';
import { drizzleToInternal } from 'src/serializer/pgDrizzleSerializer';
import { prepareFromPgImports } from 'src/serializer/pgImports';
import { pgSchema, PostgresGenerateSquasher, PostgresPushSquasher, squashPgScheme } from 'src/dialects/postgres/ddl';
import { fromDatabase, generatePgSnapshot } from 'src/serializer/pgSerializer';
import { prepareFromSingleStoreImports } from 'src/serializer/singlestoreImports';
import { singlestoreSchema, squashSingleStoreScheme } from 'src/serializer/singlestoreSchema';
import {
	fromDatabase as fromSingleStoreDatabase,
	generateSingleStoreSnapshot,
} from 'src/serializer/singlestoreSerializer';
import { prepareFromSqliteImports } from 'src/dialects/sqlite/imports';
import { sqliteSchema, squashSqliteScheme, View as SqliteView } from 'src/dialects/sqlite/ddl';
import { fromDatabase as fromSqliteDatabase, fromDrizzleSchema } from 'src/dialects/sqlite/serializer';
import { applyPgSnapshotsDiff } from 'src/dialects/postgres/diff';
import {
	mockChecksResolver,
	mockColumnsResolver,
	mockedNamedResolver,
	mockedNamedWithSchemaResolver,
	mockEnumsResolver,
	mockFKsResolver,
	mockIndexesResolver,
	mockIndPolicyResolver,
	mockPKsResolver,
	mockPolicyResolver,
	mockRolesResolver,
	mockSchemasResolver,
	mockTablesResolver,
	mockUniquesResolver,
	mockViewsResolver,
	testSequencesResolver,
} from 'src/utils/mocks';
import { libSqlLogSuggestionsAndReturn } from '../src/cli/commands/libSqlPushUtils';
import { ResolverInput, ResolverOutputWithMoved } from '../src/snapshot-differ/common';

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
export type MysqlSchema = Record<
	string,
	MySqlTable<any> | MySqlSchema | MySqlView
>;
export type SinglestoreSchema = Record<
	string,
	SingleStoreTable<any> | SingleStoreSchema /* | SingleStoreView */
>;

export const testViewsResolverMySql = (renames: Set<string>) =>
async (
	input: ResolverInput<ViewSquashed & { schema: '' }>,
): Promise<ResolverOutputWithMoved<ViewSquashed>> => {
	try {
		if (
			input.created.length === 0
			|| input.deleted.length === 0
			|| renames.size === 0
		) {
			return {
				created: input.created,
				moved: [],
				renamed: [],
				deleted: input.deleted,
			};
		}

		let createdViews = [...input.created];
		let deletedViews = [...input.deleted];

		const result: {
			created: ViewSquashed[];
			moved: { name: string; schemaFrom: string; schemaTo: string }[];
			renamed: { from: ViewSquashed; to: ViewSquashed }[];
			deleted: ViewSquashed[];
		} = { created: [], renamed: [], deleted: [], moved: [] };

		for (let rename of renames) {
			const [from, to] = rename.split('->');

			const idxFrom = deletedViews.findIndex((it) => {
				return `${it.schema || 'public'}.${it.name}` === from;
			});

			if (idxFrom >= 0) {
				const idxTo = createdViews.findIndex((it) => {
					return `${it.schema || 'public'}.${it.name}` === to;
				});

				const viewFrom = deletedViews[idxFrom];
				const viewTo = createdViews[idxFrom];

				if (viewFrom.schema !== viewTo.schema) {
					result.moved.push({
						name: viewFrom.name,
						schemaFrom: viewFrom.schema,
						schemaTo: viewTo.schema,
					});
				}

				if (viewFrom.name !== viewTo.name) {
					result.renamed.push({
						from: deletedViews[idxFrom],
						to: createdViews[idxTo],
					});
				}

				delete createdViews[idxTo];
				delete deletedViews[idxFrom];

				createdViews = createdViews.filter(Boolean);
				deletedViews = deletedViews.filter(Boolean);
			}
		}

		result.created = createdViews;
		result.deleted = deletedViews;

		return result;
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const testViewsResolverSingleStore = (renames: Set<string>) =>
async (
	input: ResolverInput<ViewSquashed & { schema: '' }>,
): Promise<ResolverOutputWithMoved<ViewSquashed>> => {
	try {
		if (
			input.created.length === 0
			|| input.deleted.length === 0
			|| renames.size === 0
		) {
			return {
				created: input.created,
				moved: [],
				renamed: [],
				deleted: input.deleted,
			};
		}

		let createdViews = [...input.created];
		let deletedViews = [...input.deleted];

		const result: {
			created: ViewSquashed[];
			moved: { name: string; schemaFrom: string; schemaTo: string }[];
			renamed: { from: ViewSquashed; to: ViewSquashed }[];
			deleted: ViewSquashed[];
		} = { created: [], renamed: [], deleted: [], moved: [] };

		for (let rename of renames) {
			const [from, to] = rename.split('->');

			const idxFrom = deletedViews.findIndex((it) => {
				return `${it.schema || 'public'}.${it.name}` === from;
			});

			if (idxFrom >= 0) {
				const idxTo = createdViews.findIndex((it) => {
					return `${it.schema || 'public'}.${it.name}` === to;
				});

				const viewFrom = deletedViews[idxFrom];
				const viewTo = createdViews[idxFrom];

				if (viewFrom.schema !== viewTo.schema) {
					result.moved.push({
						name: viewFrom.name,
						schemaFrom: viewFrom.schema,
						schemaTo: viewTo.schema,
					});
				}

				if (viewFrom.name !== viewTo.name) {
					result.renamed.push({
						from: deletedViews[idxFrom],
						to: createdViews[idxTo],
					});
				}

				delete createdViews[idxTo];
				delete deletedViews[idxFrom];

				createdViews = createdViews.filter(Boolean);
				deletedViews = deletedViews.filter(Boolean);
			}
		}

		result.created = createdViews;
		result.deleted = deletedViews;

		return result;
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const testViewsResolverSqlite = (renames: Set<string>) =>
async (
	input: ResolverInput<SqliteView>,
): Promise<ResolverOutputWithMoved<SqliteView>> => {
	try {
		if (
			input.created.length === 0
			|| input.deleted.length === 0
			|| renames.size === 0
		) {
			return {
				created: input.created,
				moved: [],
				renamed: [],
				deleted: input.deleted,
			};
		}

		let createdViews = [...input.created];
		let deletedViews = [...input.deleted];

		const result: {
			created: SqliteView[];
			moved: { name: string; schemaFrom: string; schemaTo: string }[];
			renamed: { from: SqliteView; to: SqliteView }[];
			deleted: SqliteView[];
		} = { created: [], renamed: [], deleted: [], moved: [] };

		for (let rename of renames) {
			const [from, to] = rename.split('->');

			const idxFrom = deletedViews.findIndex((it) => {
				return it.name === from;
			});

			if (idxFrom >= 0) {
				const idxTo = createdViews.findIndex((it) => {
					return it.name === to;
				});

				const viewFrom = deletedViews[idxFrom];
				const viewTo = createdViews[idxFrom];

				if (viewFrom.name !== viewTo.name) {
					result.renamed.push({
						from: deletedViews[idxFrom],
						to: createdViews[idxTo],
					});
				}

				delete createdViews[idxTo];
				delete deletedViews[idxFrom];

				createdViews = createdViews.filter(Boolean);
				deletedViews = deletedViews.filter(Boolean);
			}
		}

		result.created = createdViews;
		result.deleted = deletedViews;

		return result;
	} catch (e) {
		console.error(e);
		throw e;
	}
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
		const res = await applyPgDiffs(left, casing);
		for (const st of res.sqlStatements) {
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

	// do introspect into PgSchemaInternal
	const introspectedSchema = await fromDatabase(
		{
			query: async (query: string, values?: any[] | undefined) => {
				const res = await client.query(query, values);
				return res.rows as any[];
			},
		},
		undefined,
		schemas,
		entities,
	);

	const leftTables = Object.values(right).filter((it) => is(it, PgTable)) as PgTable[];

	const leftSchemas = Object.values(right).filter((it) => is(it, PgSchema)) as PgSchema[];

	const leftEnums = Object.values(right).filter((it) => isPgEnum(it)) as PgEnum<any>[];

	const leftSequences = Object.values(right).filter((it) => isPgSequence(it)) as PgSequence[];

	const leftRoles = Object.values(right).filter((it) => is(it, PgRole)) as PgRole[];

	const leftPolicies = Object.values(right).filter((it) => is(it, PgPolicy)) as PgPolicy[];

	const leftViews = Object.values(right).filter((it) => isPgView(it)) as PgView[];

	const leftMaterializedViews = Object.values(right).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const { schema } = drizzleToInternal(
		leftTables,
		leftEnums,
		leftSchemas,
		leftSequences,
		leftRoles,
		leftPolicies,
		leftViews,
		leftMaterializedViews,
		casing,
	);
	const serialized2 = generatePgSnapshot(schema);

	const { version: v1, dialect: d1, ...rest1 } = introspectedSchema;
	const { version: v2, dialect: d2, ...rest2 } = serialized2;

	const sch1 = {
		version: '7',
		dialect: 'postgresql',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sch2 = {
		version: '7',
		dialect: 'postgresql',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const squasher = PostgresPushSquasher;
	const sn1 = squashPgScheme(sch1, squasher);
	const sn2 = squashPgScheme(sch2, squasher);

	const validatedPrev = pgSchema.parse(sch1);
	const validatedCur = pgSchema.parse(sch2);

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements } = await applyPgSnapshotsDiff(
			sn1,
			sn2,
			mockSchemasResolver(renames),
			mockEnumsResolver(renames),
			testSequencesResolver(renames),
			mockPolicyResolver(renames),
			mockIndPolicyResolver(renames),
			mockedNamedResolver(renames),
			mockTablesResolver(renames),
			mockColumnsResolver(renames),
			mockViewsResolver(renames), // views
			mockUniquesResolver(renames), // uniques
			mockIndexesResolver(renames), // indexes
			mockChecksResolver(renames), // checks
			mockPKsResolver(renames), // pks
			mockFKsResolver(renames), // fks
			validatedPrev,
			validatedCur,
			squasher,
		);

		const {
			shouldAskForApprove,
			statementsToExecute,
			columnsToRemove,
			tablesToRemove,
			tablesToTruncate,
			infoToPrint,
			schemasToRemove,
			matViewsToRemove,
		} = await pgSuggestions(
			{
				query: async <T>(sql: string, params: any[] = []) => {
					return (await client.query(sql, params)).rows as T[];
				},
			},
			statements,
		);

		return {
			sqlStatements: statementsToExecute,
			statements,
			shouldAskForApprove,
			columnsToRemove,
			tablesToRemove,
			tablesToTruncate,
			infoToPrint,
			schemasToRemove,
			matViewsToRemove,
		};
	} else {
		const renames = new Set([]);
		const { sqlStatements, statements } = await applyPgSnapshotsDiff(
			sn1,
			sn2,
			schemasResolver,
			enumsResolver,
			sequencesResolver,
			policyResolver,
			indPolicyResolver,
			roleResolver,
			tablesResolver,
			columnsResolver,
			viewsResolver,
			uniqueResolver,
			indexesResolver,
			mockChecksResolver(renames), // checks
			mockPKsResolver(renames), // pks
			mockFKsResolver(renames), // fks
			validatedPrev,
			validatedCur,
			squasher,
		);
		return { sqlStatements, statements };
	}
};

export const applyPgDiffs = async (
	sn: PostgresSchema,
	casing: CasingType | undefined,
) => {
	const dryRun = {
		version: '7',
		dialect: 'postgresql',
		id: '0',
		prevId: '0',
		tables: {},
		enums: {},
		views: {},
		schemas: {},
		sequences: {},
		policies: {},
		roles: {},
		_meta: {
			schemas: {},
			tables: {},
			columns: {},
		},
	} as const;

	const tables = Object.values(sn).filter((it) => is(it, PgTable)) as PgTable[];

	const schemas = Object.values(sn).filter((it) => is(it, PgSchema)) as PgSchema[];

	const enums = Object.values(sn).filter((it) => isPgEnum(it)) as PgEnum<any>[];

	const sequences = Object.values(sn).filter((it) => isPgSequence(it)) as PgSequence[];

	const roles = Object.values(sn).filter((it) => is(it, PgRole)) as PgRole[];

	const views = Object.values(sn).filter((it) => isPgView(it)) as PgView[];

	const policies = Object.values(sn).filter((it) => is(it, PgPolicy)) as PgPolicy[];

	const materializedViews = Object.values(sn).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const { schema } = drizzleToInternal(
		tables,
		enums,
		schemas,
		sequences,
		roles,
		policies,
		views,
		materializedViews,
		casing,
	);

	const serialized1 = generatePgSnapshot(schema);

	const { version: v1, dialect: d1, ...rest1 } = serialized1;

	const sch1 = {
		version: '7',
		dialect: 'postgresql',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const squasher = PostgresGenerateSquasher;
	const sn1 = squashPgScheme(sch1, squasher);

	const validatedPrev = pgSchema.parse(dryRun);
	const validatedCur = pgSchema.parse(sch1);

	const { sqlStatements, statements } = await applyPgSnapshotsDiff(
		dryRun,
		sn1,
		mockSchemasResolver(new Set()),
		mockEnumsResolver(new Set()),
		testSequencesResolver(new Set()),
		mockPolicyResolver(new Set()),
		mockIndPolicyResolver(new Set()),
		mockRolesResolver(new Set()),
		mockTablesResolver(new Set()),
		mockColumnsResolver(new Set()),
		mockViewsResolver(new Set()),
		mockUniquesResolver(new Set()),
		mockIndexesResolver(new Set()),
		mockChecksResolver(new Set()),
		mockPKsResolver(new Set()),
		mockFKsResolver(new Set()),
		validatedPrev,
		validatedCur,
		squasher,
	);
	return { sqlStatements, statements };
};

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

	const { schema: schemaLeft } = drizzleToInternal(
		leftTables,
		leftEnums,
		leftSchemas,
		leftSequences,
		leftRoles,
		leftPolicies,
		leftViews,
		leftMaterializedViews,
		casing,
	);

	const { schema: schemaRight, errors, warnings } = drizzleToInternal(
		rightTables,
		rightEnums,
		rightSchemas,
		rightSequences,
		rightRoles,
		rightPolicies,
		rightViews,
		rightMaterializedViews,
		casing,
	);

	if (errors.length) {
		throw new Error();
	}

	const serialized1 = generatePgSnapshot(schemaLeft);
	const serialized2 = generatePgSnapshot(schemaRight);

	const { version: v1, dialect: d1, ...rest1 } = serialized1;
	const { version: v2, dialect: d2, ...rest2 } = serialized2;

	const sch1 = {
		version: '7',
		dialect: 'postgresql',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sch2 = {
		version: '7',
		dialect: 'postgresql',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const squasher = PostgresGenerateSquasher;

	const sn1 = squashPgScheme(sch1, squasher);
	const sn2 = squashPgScheme(sch2, squasher);

	const validatedPrev = pgSchema.parse(sch1);
	const validatedCur = pgSchema.parse(sch2);

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements, groupedStatements } = await applyPgSnapshotsDiff(
			sn1,
			sn2,
			mockSchemasResolver(renames),
			mockEnumsResolver(renames),
			testSequencesResolver(renames),
			mockPolicyResolver(renames),
			mockIndPolicyResolver(renames),
			mockRolesResolver(renames),
			mockTablesResolver(renames),
			mockColumnsResolver(renames),
			mockViewsResolver(renames),
			mockUniquesResolver(renames),
			mockIndexesResolver(renames),
			mockChecksResolver(renames),
			mockPKsResolver(renames),
			mockFKsResolver(renames),
			validatedPrev,
			validatedCur,
			squasher,
		);
		return { sqlStatements, statements, groupedStatements };
	} else {
		const { sqlStatements, statements, groupedStatements } = await applyPgSnapshotsDiff(
			sn1,
			sn2,
			schemasResolver,
			enumsResolver,
			sequencesResolver,
			policyResolver,
			indPolicyResolver,
			roleResolver,
			tablesResolver,
			columnsResolver,
			viewsResolver,
			uniqueResolver,
			indexesResolver,
			mockChecksResolver(new Set()), // checks
			mockPKsResolver(new Set()), // pks
			mockFKsResolver(new Set()), // fks
			validatedPrev,
			validatedCur,
			squasher,
		);
		return { sqlStatements, statements, groupedStatements };
	}
};

export const diffTestSchemasPushMysql = async (
	client: Connection,
	left: MysqlSchema,
	right: MysqlSchema,
	renamesArr: string[],
	schema: string,
	cli: boolean = false,
	casing?: CasingType | undefined,
) => {
	const { sqlStatements } = await applyMySqlDiffs(left, casing);
	for (const st of sqlStatements) {
		await client.query(st);
	}
	// do introspect into PgSchemaInternal
	const introspectedSchema = await fromMySqlDatabase(
		{
			query: async (sql: string, params?: any[]) => {
				const res = await client.execute(sql, params);
				return res[0] as any;
			},
		},
		schema,
	);

	const leftTables = Object.values(right).filter((it) => is(it, MySqlTable)) as MySqlTable[];

	const leftViews = Object.values(right).filter((it) => is(it, MySqlView)) as MySqlView[];

	const serialized2 = generateMySqlSnapshot(leftTables, leftViews, casing);

	const { version: v1, dialect: d1, ...rest1 } = introspectedSchema;
	const { version: v2, dialect: d2, ...rest2 } = serialized2;

	const sch1 = {
		version: '5',
		dialect: 'mysql',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sch2 = {
		version: '5',
		dialect: 'mysql',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn1 = squashMysqlScheme(sch1);
	const sn2 = squashMysqlScheme(sch2);

	const validatedPrev = mysqlSchema.parse(sch1);
	const validatedCur = mysqlSchema.parse(sch2);

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements } = await applyMysqlSnapshotsDiff(
			sn1,
			sn2,
			mockTablesResolver(renames),
			mockColumnsResolver(renames),
			testViewsResolverMySql(renames),
			validatedPrev,
			validatedCur,
			'push',
		);
		return { sqlStatements, statements };
	} else {
		const { sqlStatements, statements } = await applyMysqlSnapshotsDiff(
			sn1,
			sn2,
			tablesResolver,
			columnsResolver,
			mySqlViewsResolver,
			validatedPrev,
			validatedCur,
			'push',
		);
		return { sqlStatements, statements };
	}
};

export const applyMySqlDiffs = async (
	sn: MysqlSchema,
	casing: CasingType | undefined,
) => {
	const dryRun = {
		version: '5',
		dialect: 'mysql',
		id: '0',
		prevId: '0',
		views: {},
		tables: {},
		enums: {},
		schemas: {},
		_meta: {
			schemas: {},
			tables: {},
			columns: {},
		},
	} as const;

	const tables = Object.values(sn).filter((it) => is(it, MySqlTable)) as MySqlTable[];

	const views = Object.values(sn).filter((it) => is(it, MySqlView)) as MySqlView[];

	const serialized1 = generateMySqlSnapshot(tables, views, casing);

	const { version: v1, dialect: d1, ...rest1 } = serialized1;

	const sch1 = {
		version: '5',
		dialect: 'mysql',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sn1 = squashMysqlScheme(sch1);

	const validatedPrev = mysqlSchema.parse(dryRun);
	const validatedCur = mysqlSchema.parse(sch1);

	const { sqlStatements, statements } = await applyMysqlSnapshotsDiff(
		dryRun,
		sn1,
		mockTablesResolver(new Set()),
		mockColumnsResolver(new Set()),
		testViewsResolverMySql(new Set()),
		validatedPrev,
		validatedCur,
	);
	return { sqlStatements, statements };
};

export const diffTestSchemasMysql = async (
	left: MysqlSchema,
	right: MysqlSchema,
	renamesArr: string[],
	cli: boolean = false,
	casing?: CasingType | undefined,
) => {
	const leftTables = Object.values(left).filter((it) => is(it, MySqlTable)) as MySqlTable[];

	const leftViews = Object.values(left).filter((it) => is(it, MySqlView)) as MySqlView[];

	const rightTables = Object.values(right).filter((it) => is(it, MySqlTable)) as MySqlTable[];

	const rightViews = Object.values(right).filter((it) => is(it, MySqlView)) as MySqlView[];

	const serialized1 = generateMySqlSnapshot(leftTables, leftViews, casing);
	const serialized2 = generateMySqlSnapshot(rightTables, rightViews, casing);

	const { version: v1, dialect: d1, ...rest1 } = serialized1;
	const { version: v2, dialect: d2, ...rest2 } = serialized2;

	const sch1 = {
		version: '5',
		dialect: 'mysql',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sch2 = {
		version: '5',
		dialect: 'mysql',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn1 = squashMysqlScheme(sch1);
	const sn2 = squashMysqlScheme(sch2);

	const validatedPrev = mysqlSchema.parse(sch1);
	const validatedCur = mysqlSchema.parse(sch2);

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements } = await applyMysqlSnapshotsDiff(
			sn1,
			sn2,
			mockTablesResolver(renames),
			mockColumnsResolver(renames),
			testViewsResolverMySql(renames),
			validatedPrev,
			validatedCur,
		);
		return { sqlStatements, statements };
	}

	const { sqlStatements, statements } = await applyMysqlSnapshotsDiff(
		sn1,
		sn2,
		tablesResolver,
		columnsResolver,
		mySqlViewsResolver,
		validatedPrev,
		validatedCur,
	);
	return { sqlStatements, statements };
};

export const diffTestSchemasSingleStore = async (
	left: SinglestoreSchema,
	right: SinglestoreSchema,
	renamesArr: string[],
	cli: boolean = false,
	casing?: CasingType | undefined,
) => {
	const leftTables = Object.values(left).filter((it) => is(it, SingleStoreTable)) as SingleStoreTable[];

	/* const leftViews = Object.values(left).filter((it) => is(it, SingleStoreView)) as SingleStoreView[]; */

	const rightTables = Object.values(right).filter((it) => is(it, SingleStoreTable)) as SingleStoreTable[];

	/* const rightViews = Object.values(right).filter((it) => is(it, SingleStoreView)) as SingleStoreView[]; */

	const serialized1 = generateSingleStoreSnapshot(
		leftTables,
		/* leftViews, */
		casing,
	);
	const serialized2 = generateSingleStoreSnapshot(
		rightTables,
		/* rightViews, */
		casing,
	);

	const { version: v1, dialect: d1, ...rest1 } = serialized1;
	const { version: v2, dialect: d2, ...rest2 } = serialized2;

	const sch1 = {
		version: '1',
		dialect: 'singlestore',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sch2 = {
		version: '1',
		dialect: 'singlestore',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn1 = squashSingleStoreScheme(sch1);
	const sn2 = squashSingleStoreScheme(sch2);

	const validatedPrev = singlestoreSchema.parse(sch1);
	const validatedCur = singlestoreSchema.parse(sch2);

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements } = await applySingleStoreSnapshotsDiff(
			sn1,
			sn2,
			mockTablesResolver(renames),
			mockColumnsResolver(renames),
			/* testViewsResolverSingleStore(renames), */
			validatedPrev,
			validatedCur,
		);
		return { sqlStatements, statements };
	}

	const { sqlStatements, statements } = await applySingleStoreSnapshotsDiff(
		sn1,
		sn2,
		tablesResolver,
		columnsResolver,
		/* singleStoreViewsResolver, */
		validatedPrev,
		validatedCur,
	);
	return { sqlStatements, statements };
};

export const diffTestSchemasPushSingleStore = async (
	client: Connection,
	left: SinglestoreSchema,
	right: SinglestoreSchema,
	renamesArr: string[],
	schema: string,
	cli: boolean = false,
	casing?: CasingType | undefined,
) => {
	const { sqlStatements } = await applySingleStoreDiffs(left, casing);
	for (const st of sqlStatements) {
		await client.query(st);
	}
	// do introspect into PgSchemaInternal
	const introspectedSchema = await fromSingleStoreDatabase(
		{
			query: async (sql: string, params?: any[]) => {
				const res = await client.execute(sql, params);
				return res[0] as any;
			},
		},
		schema,
	);

	const leftTables = Object.values(right).filter((it) => is(it, SingleStoreTable)) as SingleStoreTable[];

	/* const leftViews = Object.values(right).filter((it) => is(it, SingleStoreView)) as SingleStoreView[]; */

	const serialized2 = generateSingleStoreSnapshot(
		leftTables,
		/* leftViews, */
		casing,
	);

	const { version: v1, dialect: d1, ...rest1 } = introspectedSchema;
	const { version: v2, dialect: d2, ...rest2 } = serialized2;

	const sch1 = {
		version: '1',
		dialect: 'singlestore',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sch2 = {
		version: '1',
		dialect: 'singlestore',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn1 = squashSingleStoreScheme(sch1);
	const sn2 = squashSingleStoreScheme(sch2);

	const validatedPrev = singlestoreSchema.parse(sch1);
	const validatedCur = singlestoreSchema.parse(sch2);

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements } = await applySingleStoreSnapshotsDiff(
			sn1,
			sn2,
			mockTablesResolver(renames),
			mockColumnsResolver(renames),
			/* testViewsResolverSingleStore(renames), */
			validatedPrev,
			validatedCur,
			'push',
		);
		return { sqlStatements, statements };
	} else {
		const { sqlStatements, statements } = await applySingleStoreSnapshotsDiff(
			sn1,
			sn2,
			tablesResolver,
			columnsResolver,
			/* singleStoreViewsResolver, */
			validatedPrev,
			validatedCur,
			'push',
		);
		return { sqlStatements, statements };
	}
};

export const applySingleStoreDiffs = async (
	sn: SinglestoreSchema,
	casing: CasingType | undefined,
) => {
	const dryRun = {
		version: '1',
		dialect: 'singlestore',
		id: '0',
		prevId: '0',
		tables: {},
		views: {},
		enums: {},
		schemas: {},
		_meta: {
			schemas: {},
			tables: {},
			columns: {},
		},
	} as const;

	const tables = Object.values(sn).filter((it) => is(it, SingleStoreTable)) as SingleStoreTable[];

	/* const views = Object.values(sn).filter((it) => is(it, SingleStoreView)) as SingleStoreView[]; */

	const serialized1 = generateSingleStoreSnapshot(tables, /* views, */ casing);

	const { version: v1, dialect: d1, ...rest1 } = serialized1;

	const sch1 = {
		version: '1',
		dialect: 'singlestore',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sn1 = squashSingleStoreScheme(sch1);

	const validatedPrev = singlestoreSchema.parse(dryRun);
	const validatedCur = singlestoreSchema.parse(sch1);

	const { sqlStatements, statements } = await applySingleStoreSnapshotsDiff(
		dryRun,
		sn1,
		mockTablesResolver(new Set()),
		mockColumnsResolver(new Set()),
		/* testViewsResolverSingleStore(new Set()), */
		validatedPrev,
		validatedCur,
	);
	return { sqlStatements, statements };
};

export const diffTestSchemasPushSqlite = async (
	client: Database,
	left: SqliteSchema,
	right: SqliteSchema,
	renamesArr: string[],
	cli: boolean = false,
	seedStatements: string[] = [],
	casing?: CasingType | undefined,
) => {
	const { sqlStatements } = await applySqliteDiffs(left, 'push');

	for (const st of sqlStatements) {
		client.exec(st);
	}

	for (const st of seedStatements) {
		client.exec(st);
	}

	// do introspect into PgSchemaInternal
	const introspectedSchema = await fromSqliteDatabase(
		{
			query: async <T>(sql: string, params: any[] = []) => {
				return client.prepare(sql).bind(params).all() as T[];
			},
			run: async (query: string) => {
				client.prepare(query).run();
			},
		},
		undefined,
	);

	const rightTables = Object.values(right).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];

	const rightViews = Object.values(right).filter((it) => is(it, SQLiteView)) as SQLiteView[];

	const serialized2 = drizzleToInternal(rightTables, rightViews, casing);

	const { version: v1, dialect: d1, ...rest1 } = introspectedSchema;
	const { version: v2, dialect: d2, ...rest2 } = serialized2;

	const sch1 = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sch2 = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn1 = squashSqliteScheme(sch1, 'push');
	const sn2 = squashSqliteScheme(sch2, 'push');

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements, _meta } = await applySqliteSnapshotsDiff(
			sn1,
			sn2,
			mockTablesResolver(renames),
			mockColumnsResolver(renames),
			testViewsResolverSqlite(renames),
			sch1,
			sch2,
			'push',
		);

		const {
			statementsToExecute,
			columnsToRemove,
			infoToPrint,
			schemasToRemove,
			shouldAskForApprove,
			tablesToRemove,
			tablesToTruncate,
		} = await logSuggestionsAndReturn(
			{
				query: async <T>(sql: string, params: any[] = []) => {
					return client.prepare(sql).bind(params).all() as T[];
				},
				run: async (query: string) => {
					client.prepare(query).run();
				},
			},
			statements,
			sn1,
			sn2,
			_meta!,
		);

		return {
			sqlStatements: statementsToExecute,
			statements,
			columnsToRemove,
			infoToPrint,
			schemasToRemove,
			shouldAskForApprove,
			tablesToRemove,
			tablesToTruncate,
		};
	} else {
		const { sqlStatements, statements } = await applySqliteSnapshotsDiff(
			sn1,
			sn2,
			tablesResolver,
			columnsResolver,
			sqliteViewsResolver,
			sch1,
			sch2,
			'push',
		);
		return { sqlStatements, statements };
	}
};

export async function diffTestSchemasPushLibSQL(
	client: Client,
	left: SqliteSchema,
	right: SqliteSchema,
	renamesArr: string[],
	cli: boolean = false,
	seedStatements: string[] = [],
	casing?: CasingType | undefined,
) {
	const { sqlStatements } = await applyLibSQLDiffs(left, 'push');

	for (const st of sqlStatements) {
		await client.execute(st);
	}

	for (const st of seedStatements) {
		await client.execute(st);
	}

	const introspectedSchema = await fromSqliteDatabase(
		{
			query: async <T>(sql: string, params?: any[]) => {
				const res = await client.execute({ sql, args: params || [] });
				return res.rows as T[];
			},
			run: async (query: string) => {
				await client.execute(query);
			},
		},
		undefined,
	);

	const leftTables = Object.values(right).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];

	const leftViews = Object.values(right).filter((it) => is(it, SQLiteView)) as SQLiteView[];

	const serialized2 = drizzleToInternal(leftTables, leftViews, casing);

	const { version: v1, dialect: d1, ...rest1 } = introspectedSchema;
	const { version: v2, dialect: d2, ...rest2 } = serialized2;

	const sch1 = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sch2 = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn1 = squashSqliteScheme(sch1, 'push');
	const sn2 = squashSqliteScheme(sch2, 'push');

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements, _meta } = await applyLibSQLSnapshotsDiff(
			sn1,
			sn2,
			mockTablesResolver(renames),
			mockColumnsResolver(renames),
			testViewsResolverSqlite(renames),
			sch1,
			sch2,
			'push',
		);

		const {
			statementsToExecute,
			columnsToRemove,
			infoToPrint,
			shouldAskForApprove,
			tablesToRemove,
			tablesToTruncate,
		} = await libSqlLogSuggestionsAndReturn(
			{
				query: async <T>(sql: string, params?: any[]) => {
					const res = await client.execute({ sql, args: params || [] });
					return res.rows as T[];
				},
				run: async (query: string) => {
					await client.execute(query);
				},
			},
			statements,
			sn1,
			sn2,
			_meta!,
		);

		return {
			sqlStatements: statementsToExecute,
			statements,
			columnsToRemove,
			infoToPrint,
			shouldAskForApprove,
			tablesToRemove,
			tablesToTruncate,
		};
	} else {
		const { sqlStatements, statements } = await applyLibSQLSnapshotsDiff(
			sn1,
			sn2,
			tablesResolver,
			columnsResolver,
			sqliteViewsResolver,
			sch1,
			sch2,
			'push',
		);
		return { sqlStatements, statements };
	}
}

export const applySqliteDiffs = async (
	sn: SqliteSchema,
	action?: 'push' | undefined,
	casing?: CasingType | undefined,
) => {
	const dryRun = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		tables: {},
		enums: {},
		views: {},
		schemas: {},
		_meta: {
			schemas: {},
			tables: {},
			columns: {},
		},
	} as const;

	const tables = Object.values(sn).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];

	const views = Object.values(sn).filter((it) => is(it, SQLiteView)) as SQLiteView[];

	const serialized1 = drizzleToInternal(tables, views, casing);

	const { version: v1, dialect: d1, ...rest1 } = serialized1;

	const sch1 = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sn1 = squashSqliteScheme(sch1, action);

	const { sqlStatements, statements } = await applySqliteSnapshotsDiff(
		dryRun,
		sn1,
		mockTablesResolver(new Set()),
		mockColumnsResolver(new Set()),
		testViewsResolverSqlite(new Set()),
		dryRun,
		sch1,
		action,
	);

	return { sqlStatements, statements };
};

export const applyLibSQLDiffs = async (
	sn: SqliteSchema,
	action?: 'push' | undefined,
	casing?: CasingType | undefined,
) => {
	const dryRun = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		tables: {},
		views: {},
		enums: {},
		schemas: {},
		_meta: {
			schemas: {},
			tables: {},
			columns: {},
		},
	} as const;

	const tables = Object.values(sn).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];

	const views = Object.values(sn).filter((it) => is(it, SQLiteView)) as SQLiteView[];

	const serialized1 = drizzleToInternal(tables, views, casing);

	const { version: v1, dialect: d1, ...rest1 } = serialized1;

	const sch1 = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sn1 = squashSqliteScheme(sch1, action);

	const { sqlStatements, statements } = await applyLibSQLSnapshotsDiff(
		dryRun,
		sn1,
		mockTablesResolver(new Set()),
		mockColumnsResolver(new Set()),
		testViewsResolverSqlite(new Set()),
		dryRun,
		sch1,
		action,
	);

	return { sqlStatements, statements };
};



export const diffTestSchemasLibSQL = async (
	left: SqliteSchema,
	right: SqliteSchema,
	renamesArr: string[],
	cli: boolean = false,
	casing?: CasingType | undefined,
) => {
	const leftTables = Object.values(left).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];

	const leftViews = Object.values(left).filter((it) => is(it, SQLiteView)) as SQLiteView[];

	const rightTables = Object.values(right).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];

	const rightViews = Object.values(right).filter((it) => is(it, SQLiteView)) as SQLiteView[];

	const serialized1 = drizzleToInternal(leftTables, leftViews, casing);
	const serialized2 = drizzleToInternal(rightTables, rightViews, casing);

	const { version: v1, dialect: d1, ...rest1 } = serialized1;
	const { version: v2, dialect: d2, ...rest2 } = serialized2;

	const sch1 = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sch2 = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn1 = squashSqliteScheme(sch1);
	const sn2 = squashSqliteScheme(sch2);

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements } = await applyLibSQLSnapshotsDiff(
			sn1,
			sn2,
			mockTablesResolver(renames),
			mockColumnsResolver(renames),
			testViewsResolverSqlite(renames),
			sch1,
			sch2,
		);
		return { sqlStatements, statements };
	}

	const { sqlStatements, statements } = await applyLibSQLSnapshotsDiff(
		sn1,
		sn2,
		tablesResolver,
		columnsResolver,
		sqliteViewsResolver,
		sch1,
		sch2,
	);
	return { sqlStatements, statements };
};

// --- Introspect to file helpers ---

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
	const introspectedSchema = await fromDatabase(
		{
			query: async (query: string, values?: any[] | undefined) => {
				const res = await client.query(query, values);
				return res.rows as any[];
			},
		},
		undefined,
		schemas,
		entities,
	);

	const { version: initV, dialect: initD, ...initRest } = introspectedSchema;

	const initSch = {
		version: '7',
		dialect: 'postgresql',
		id: '0',
		prevId: '0',
		...initRest,
	} as const;

	const squasher = PostgresPushSquasher;

	const initSn = squashPgScheme(initSch, squasher);
	const validatedCur = pgSchema.parse(initSch);

	// write to ts file
	const file = schemaToTypeScript(introspectedSchema, 'camel');

	fs.writeFileSync(`tests/introspect/postgres/${testName}.ts`, file.file);

	// generate snapshot from ts file
	const response = await prepareFromPgImports([
		`tests/introspect/postgres/${testName}.ts`,
	]);

	const afterFileImports = generatePgSnapshot(
		response.tables,
		response.enums,
		response.schemas,
		response.sequences,
		response.roles,
		response.policies,
		response.views,
		response.matViews,
		casing,
	);

	const { version: v2, dialect: d2, ...rest2 } = afterFileImports;

	const sch2 = {
		version: '7',
		dialect: 'postgresql',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn2AfterIm = squashPgScheme(sch2, squasher);
	const validatedCurAfterImport = pgSchema.parse(sch2);

	const {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	} = await applyPgSnapshotsDiff(
		initSn,
		sn2AfterIm,
		mockSchemasResolver(new Set()),
		mockEnumsResolver(new Set()),
		testSequencesResolver(new Set()),
		mockPolicyResolver(new Set()),
		mockIndPolicyResolver(new Set()),
		mockRolesResolver(new Set()),
		mockTablesResolver(new Set()),
		mockColumnsResolver(new Set()),
		mockViewsResolver(new Set()),
		mockUniquesResolver(new Set()),
		mockIndexesResolver(new Set()),
		validatedCur,
		validatedCurAfterImport,
		squasher,
	);

	fs.rmSync(`tests/introspect/postgres/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};

export const introspectMySQLToFile = async (
	client: Connection,
	initSchema: MysqlSchema,
	testName: string,
	schema: string,
	casing?: CasingType | undefined,
) => {
	// put in db
	const { sqlStatements } = await applyMySqlDiffs(initSchema, casing);
	for (const st of sqlStatements) {
		await client.query(st);
	}

	// introspect to schema
	const introspectedSchema = await fromMySqlDatabase(
		{
			query: async (sql: string, params?: any[] | undefined) => {
				const res = await client.execute(sql, params);
				return res[0] as any;
			},
		},
		schema,
	);

	const { version: initV, dialect: initD, ...initRest } = introspectedSchema;

	const initSch = {
		version: '5',
		dialect: 'mysql',
		id: '0',
		prevId: '0',
		...initRest,
	} as const;

	const initSn = squashMysqlScheme(initSch);
	const validatedCur = mysqlSchema.parse(initSch);

	const file = schemaToTypeScriptMySQL(introspectedSchema, 'camel');

	fs.writeFileSync(`tests/introspect/mysql/${testName}.ts`, file.file);

	const response = await prepareFromMySqlImports([
		`tests/introspect/mysql/${testName}.ts`,
	]);

	const afterFileImports = generateMySqlSnapshot(
		response.tables,
		response.views,
		casing,
	);

	const { version: v2, dialect: d2, ...rest2 } = afterFileImports;

	const sch2 = {
		version: '5',
		dialect: 'mysql',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn2AfterIm = squashMysqlScheme(sch2);
	const validatedCurAfterImport = mysqlSchema.parse(sch2);

	const {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	} = await applyMysqlSnapshotsDiff(
		sn2AfterIm,
		initSn,
		mockTablesResolver(new Set()),
		mockColumnsResolver(new Set()),
		testViewsResolverMySql(new Set()),
		validatedCurAfterImport,
		validatedCur,
	);

	fs.rmSync(`tests/introspect/mysql/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};

export const introspectSingleStoreToFile = async (
	client: Connection,
	initSchema: SinglestoreSchema,
	testName: string,
	schema: string,
	casing?: CasingType | undefined,
) => {
	// put in db
	const { sqlStatements } = await applySingleStoreDiffs(initSchema, casing);
	for (const st of sqlStatements) {
		await client.query(st);
	}

	// introspect to schema
	const introspectedSchema = await fromSingleStoreDatabase(
		{
			query: async (sql: string, params?: any[] | undefined) => {
				const res = await client.execute(sql, params);
				return res[0] as any;
			},
		},
		schema,
	);

	const file = schemaToTypeScriptSingleStore(introspectedSchema, 'camel');

	fs.writeFileSync(`tests/introspect/singlestore/${testName}.ts`, file.file);

	const response = await prepareFromSingleStoreImports([
		`tests/introspect/singlestore/${testName}.ts`,
	]);

	const afterFileImports = generateSingleStoreSnapshot(
		response.tables,
		/* response.views, */
		casing,
	);

	const { version: v2, dialect: d2, ...rest2 } = afterFileImports;

	const sch2 = {
		version: '1',
		dialect: 'singlestore',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn2AfterIm = squashSingleStoreScheme(sch2);
	const validatedCurAfterImport = singlestoreSchema.parse(sch2);

	const leftTables = Object.values(initSchema).filter((it) => is(it, SingleStoreTable)) as SingleStoreTable[];

	const initSnapshot = generateSingleStoreSnapshot(
		leftTables,
		/* response.views, */
		casing,
	);

	const { version: initV, dialect: initD, ...initRest } = initSnapshot;

	const initSch = {
		version: '1',
		dialect: 'singlestore',
		id: '0',
		prevId: '0',
		...initRest,
	} as const;

	const initSn = squashSingleStoreScheme(initSch);
	const validatedCur = singlestoreSchema.parse(initSch);

	const {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	} = await applySingleStoreSnapshotsDiff(
		sn2AfterIm,
		initSn,
		mockTablesResolver(new Set()),
		mockColumnsResolver(new Set()),
		/* testViewsResolverSingleStore(new Set()), */
		validatedCurAfterImport,
		validatedCur,
	);

	fs.rmSync(`tests/introspect/singlestore/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};

export const introspectSQLiteToFile = async (
	client: Database,
	initSchema: SqliteSchema,
	testName: string,
	casing?: CasingType | undefined,
) => {
	// put in db
	const { sqlStatements } = await applySqliteDiffs(initSchema);
	for (const st of sqlStatements) {
		client.exec(st);
	}

	// introspect to schema
	const introspectedSchema = await fromSqliteDatabase(
		{
			query: async <T>(sql: string, params: any[] = []) => {
				return client.prepare(sql).bind(params).all() as T[];
			},
			run: async (query: string) => {
				client.prepare(query).run();
			},
		},
		undefined,
	);

	const { version: initV, dialect: initD, ...initRest } = introspectedSchema;

	const initSch = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...initRest,
	} as const;

	const initSn = squashSqliteScheme(initSch);

	const validatedCur = sqliteSchema.parse(initSch);

	const file = schemaToTypeScriptSQLite(introspectedSchema, 'camel');

	fs.writeFileSync(`tests/introspect/sqlite/${testName}.ts`, file.file);

	const response = await prepareFromSqliteImports([
		`tests/introspect/sqlite/${testName}.ts`,
	]);

	const afterFileImports = drizzleToInternal(
		response.tables,
		response.views,
		casing,
	);

	const { version: v2, dialect: d2, ...rest2 } = afterFileImports;

	const sch2 = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn2AfterIm = squashSqliteScheme(sch2);
	const validatedCurAfterImport = sqliteSchema.parse(sch2);

	const {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	} = await applySqliteSnapshotsDiff(
		sn2AfterIm,
		initSn,
		mockTablesResolver(new Set()),
		mockColumnsResolver(new Set()),
		testViewsResolverSqlite(new Set()),
		validatedCurAfterImport,
		validatedCur,
	);

	fs.rmSync(`tests/introspect/sqlite/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};

export const introspectLibSQLToFile = async (
	client: Client,
	initSchema: SqliteSchema,
	testName: string,
	casing?: CasingType | undefined,
) => {
	// put in db
	const { sqlStatements } = await applyLibSQLDiffs(initSchema);
	for (const st of sqlStatements) {
		client.execute(st);
	}

	// introspect to schema
	const introspectedSchema = await fromSqliteDatabase(
		{
			query: async <T>(sql: string, params: any[] = []) => {
				return (await client.execute({ sql, args: params })).rows as T[];
			},
			run: async (query: string) => {
				client.execute(query);
			},
		},
		undefined,
	);

	const { version: initV, dialect: initD, ...initRest } = introspectedSchema;

	const initSch = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...initRest,
	} as const;

	const initSn = squashSqliteScheme(initSch);

	const validatedCur = sqliteSchema.parse(initSch);

	const file = schemaToTypeScriptSQLite(introspectedSchema, 'camel');

	fs.writeFileSync(`tests/introspect/libsql/${testName}.ts`, file.file);

	const response = await prepareFromSqliteImports([
		`tests/introspect/libsql/${testName}.ts`,
	]);

	const afterFileImports = drizzleToInternal(
		response.tables,
		response.views,
		casing,
	);

	const { version: v2, dialect: d2, ...rest2 } = afterFileImports;

	const sch2 = {
		version: '6',
		dialect: 'sqlite',
		id: '0',
		prevId: '0',
		...rest2,
	} as const;

	const sn2AfterIm = squashSqliteScheme(sch2);
	const validatedCurAfterImport = sqliteSchema.parse(sch2);

	const {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	} = await applyLibSQLSnapshotsDiff(
		sn2AfterIm,
		initSn,
		mockTablesResolver(new Set()),
		mockColumnsResolver(new Set()),
		testViewsResolverSqlite(new Set()),
		validatedCurAfterImport,
		validatedCur,
	);

	fs.rmSync(`tests/introspect/libsql/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};
