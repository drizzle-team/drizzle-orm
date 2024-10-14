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
	PgSchema,
	PgSequence,
	PgTable,
	PgView,
} from 'drizzle-orm/pg-core';
import { SQLiteTable, SQLiteView } from 'drizzle-orm/sqlite-core';
import * as fs from 'fs';
import { Connection } from 'mysql2/promise';
import { libSqlLogSuggestionsAndReturn } from 'src/cli/commands/libSqlPushUtils';
import {
	columnsResolver,
	enumsResolver,
	mySqlViewsResolver,
	Named,
	schemasResolver,
	sequencesResolver,
	sqliteViewsResolver,
	tablesResolver,
	viewsResolver,
} from 'src/cli/commands/migrate';
import { pgSuggestions } from 'src/cli/commands/pgPushUtils';
import { logSuggestionsAndReturn } from 'src/cli/commands/sqlitePushUtils';
import { CasingType } from 'src/cli/validations/common';
import { schemaToTypeScript as schemaToTypeScriptMySQL } from 'src/introspect-mysql';
import { schemaToTypeScript } from 'src/introspect-pg';
import { schemaToTypeScript as schemaToTypeScriptSQLite } from 'src/introspect-sqlite';
import { prepareFromMySqlImports } from 'src/serializer/mysqlImports';
import { mysqlSchema, squashMysqlScheme, ViewSquashed } from 'src/serializer/mysqlSchema';
import { generateMySqlSnapshot } from 'src/serializer/mysqlSerializer';
import { fromDatabase as fromMySqlDatabase } from 'src/serializer/mysqlSerializer';
import { prepareFromPgImports } from 'src/serializer/pgImports';
import { pgSchema, squashPgScheme, View } from 'src/serializer/pgSchema';
import { fromDatabase, generatePgSnapshot } from 'src/serializer/pgSerializer';
import { prepareFromSqliteImports } from 'src/serializer/sqliteImports';
import { sqliteSchema, squashSqliteScheme, View as SqliteView } from 'src/serializer/sqliteSchema';
import { fromDatabase as fromSqliteDatabase } from 'src/serializer/sqliteSerializer';
import { generateSqliteSnapshot } from 'src/serializer/sqliteSerializer';
import {
	applyLibSQLSnapshotsDiff,
	applyMysqlSnapshotsDiff,
	applyPgSnapshotsDiff,
	applySqliteSnapshotsDiff,
	Column,
	ColumnsResolverInput,
	ColumnsResolverOutput,
	Enum,
	ResolverInput,
	ResolverOutput,
	ResolverOutputWithMoved,
	Sequence,
	Table,
} from 'src/snapshotsDiffer';

export type PostgresSchema = Record<
	string,
	PgTable<any> | PgEnum<any> | PgSchema | PgSequence | PgView | PgMaterializedView
>;
export type MysqlSchema = Record<string, MySqlTable<any> | MySqlSchema | MySqlView>;
export type SqliteSchema = Record<string, SQLiteTable<any> | SQLiteView>;

export const testSchemasResolver =
	(renames: Set<string>) => async (input: ResolverInput<Named>): Promise<ResolverOutput<Named>> => {
		try {
			if (input.created.length === 0 || input.deleted.length === 0 || renames.size === 0) {
				return {
					created: input.created,
					renamed: [],
					deleted: input.deleted,
				};
			}

			let createdSchemas = [...input.created];
			let deletedSchemas = [...input.deleted];

			const result: {
				created: Named[];
				renamed: { from: Named; to: Named }[];
				deleted: Named[];
			} = { created: [], renamed: [], deleted: [] };

			for (let rename of renames) {
				const [from, to] = rename.split('->');

				const idxFrom = deletedSchemas.findIndex((it) => {
					return it.name === from;
				});

				if (idxFrom >= 0) {
					const idxTo = createdSchemas.findIndex((it) => {
						return it.name === to;
					});

					result.renamed.push({
						from: deletedSchemas[idxFrom],
						to: createdSchemas[idxTo],
					});

					delete createdSchemas[idxTo];
					delete deletedSchemas[idxFrom];

					createdSchemas = createdSchemas.filter(Boolean);
					deletedSchemas = deletedSchemas.filter(Boolean);
				}
			}

			result.created = createdSchemas;
			result.deleted = deletedSchemas;

			return result;
		} catch (e) {
			console.error(e);
			throw e;
		}
	};

export const testSequencesResolver =
	(renames: Set<string>) => async (input: ResolverInput<Sequence>): Promise<ResolverOutputWithMoved<Sequence>> => {
		try {
			if (input.created.length === 0 || input.deleted.length === 0 || renames.size === 0) {
				return {
					created: input.created,
					moved: [],
					renamed: [],
					deleted: input.deleted,
				};
			}

			let createdSequences = [...input.created];
			let deletedSequences = [...input.deleted];

			const result: {
				created: Sequence[];
				moved: { name: string; schemaFrom: string; schemaTo: string }[];
				renamed: { from: Sequence; to: Sequence }[];
				deleted: Sequence[];
			} = { created: [], renamed: [], deleted: [], moved: [] };

			for (let rename of renames) {
				const [from, to] = rename.split('->');

				const idxFrom = deletedSequences.findIndex((it) => {
					return `${it.schema || 'public'}.${it.name}` === from;
				});

				if (idxFrom >= 0) {
					const idxTo = createdSequences.findIndex((it) => {
						return `${it.schema || 'public'}.${it.name}` === to;
					});

					const tableFrom = deletedSequences[idxFrom];
					const tableTo = createdSequences[idxFrom];

					if (tableFrom.schema !== tableTo.schema) {
						result.moved.push({
							name: tableFrom.name,
							schemaFrom: tableFrom.schema,
							schemaTo: tableTo.schema,
						});
					}

					if (tableFrom.name !== tableTo.name) {
						result.renamed.push({
							from: deletedSequences[idxFrom],
							to: createdSequences[idxTo],
						});
					}

					delete createdSequences[idxTo];
					delete deletedSequences[idxFrom];

					createdSequences = createdSequences.filter(Boolean);
					deletedSequences = deletedSequences.filter(Boolean);
				}
			}

			result.created = createdSequences;
			result.deleted = deletedSequences;

			return result;
		} catch (e) {
			console.error(e);
			throw e;
		}
	};

export const testEnumsResolver =
	(renames: Set<string>) => async (input: ResolverInput<Enum>): Promise<ResolverOutputWithMoved<Enum>> => {
		try {
			if (input.created.length === 0 || input.deleted.length === 0 || renames.size === 0) {
				return {
					created: input.created,
					moved: [],
					renamed: [],
					deleted: input.deleted,
				};
			}

			let createdEnums = [...input.created];
			let deletedEnums = [...input.deleted];

			const result: {
				created: Enum[];
				moved: { name: string; schemaFrom: string; schemaTo: string }[];
				renamed: { from: Enum; to: Enum }[];
				deleted: Enum[];
			} = { created: [], renamed: [], deleted: [], moved: [] };

			for (let rename of renames) {
				const [from, to] = rename.split('->');

				const idxFrom = deletedEnums.findIndex((it) => {
					return `${it.schema || 'public'}.${it.name}` === from;
				});

				if (idxFrom >= 0) {
					const idxTo = createdEnums.findIndex((it) => {
						return `${it.schema || 'public'}.${it.name}` === to;
					});

					const tableFrom = deletedEnums[idxFrom];
					const tableTo = createdEnums[idxFrom];

					if (tableFrom.schema !== tableTo.schema) {
						result.moved.push({
							name: tableFrom.name,
							schemaFrom: tableFrom.schema,
							schemaTo: tableTo.schema,
						});
					}

					if (tableFrom.name !== tableTo.name) {
						result.renamed.push({
							from: deletedEnums[idxFrom],
							to: createdEnums[idxTo],
						});
					}

					delete createdEnums[idxTo];
					delete deletedEnums[idxFrom];

					createdEnums = createdEnums.filter(Boolean);
					deletedEnums = deletedEnums.filter(Boolean);
				}
			}

			result.created = createdEnums;
			result.deleted = deletedEnums;

			return result;
		} catch (e) {
			console.error(e);
			throw e;
		}
	};

export const testTablesResolver =
	(renames: Set<string>) => async (input: ResolverInput<Table>): Promise<ResolverOutputWithMoved<Table>> => {
		try {
			if (input.created.length === 0 || input.deleted.length === 0 || renames.size === 0) {
				return {
					created: input.created,
					moved: [],
					renamed: [],
					deleted: input.deleted,
				};
			}

			let createdTables = [...input.created];
			let deletedTables = [...input.deleted];

			const result: {
				created: Table[];
				moved: { name: string; schemaFrom: string; schemaTo: string }[];
				renamed: { from: Table; to: Table }[];
				deleted: Table[];
			} = { created: [], renamed: [], deleted: [], moved: [] };

			for (let rename of renames) {
				const [from, to] = rename.split('->');

				const idxFrom = deletedTables.findIndex((it) => {
					return `${it.schema || 'public'}.${it.name}` === from;
				});

				if (idxFrom >= 0) {
					const idxTo = createdTables.findIndex((it) => {
						return `${it.schema || 'public'}.${it.name}` === to;
					});

					const tableFrom = deletedTables[idxFrom];
					const tableTo = createdTables[idxFrom];

					if (tableFrom.schema !== tableTo.schema) {
						result.moved.push({
							name: tableFrom.name,
							schemaFrom: tableFrom.schema,
							schemaTo: tableTo.schema,
						});
					}

					if (tableFrom.name !== tableTo.name) {
						result.renamed.push({
							from: deletedTables[idxFrom],
							to: createdTables[idxTo],
						});
					}

					delete createdTables[idxTo];
					delete deletedTables[idxFrom];

					createdTables = createdTables.filter(Boolean);
					deletedTables = deletedTables.filter(Boolean);
				}
			}

			result.created = createdTables;
			result.deleted = deletedTables;

			return result;
		} catch (e) {
			console.error(e);
			throw e;
		}
	};

export const testColumnsResolver =
	(renames: Set<string>) => async (input: ColumnsResolverInput<Column>): Promise<ColumnsResolverOutput<Column>> => {
		try {
			if (input.created.length === 0 || input.deleted.length === 0 || renames.size === 0) {
				return {
					tableName: input.tableName,
					schema: input.schema,
					created: input.created,
					renamed: [],
					deleted: input.deleted,
				};
			}

			let createdColumns = [...input.created];
			let deletedColumns = [...input.deleted];

			const renamed: { from: Column; to: Column }[] = [];

			const schema = input.schema || 'public';

			for (let rename of renames) {
				const [from, to] = rename.split('->');

				const idxFrom = deletedColumns.findIndex((it) => {
					return `${schema}.${input.tableName}.${it.name}` === from;
				});

				if (idxFrom >= 0) {
					const idxTo = createdColumns.findIndex((it) => {
						return `${schema}.${input.tableName}.${it.name}` === to;
					});

					renamed.push({
						from: deletedColumns[idxFrom],
						to: createdColumns[idxTo],
					});

					delete createdColumns[idxTo];
					delete deletedColumns[idxFrom];

					createdColumns = createdColumns.filter(Boolean);
					deletedColumns = deletedColumns.filter(Boolean);
				}
			}

			return {
				tableName: input.tableName,
				schema: input.schema,
				created: createdColumns,
				deleted: deletedColumns,
				renamed,
			};
		} catch (e) {
			console.error(e);
			throw e;
		}
	};

export const testViewsResolver =
	(renames: Set<string>) => async (input: ResolverInput<View>): Promise<ResolverOutputWithMoved<View>> => {
		try {
			if (input.created.length === 0 || input.deleted.length === 0 || renames.size === 0) {
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
				created: View[];
				moved: { name: string; schemaFrom: string; schemaTo: string }[];
				renamed: { from: View; to: View }[];
				deleted: View[];
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

export const testViewsResolverMySql =
	(renames: Set<string>) =>
	async (input: ResolverInput<ViewSquashed & { schema: '' }>): Promise<ResolverOutputWithMoved<ViewSquashed>> => {
		try {
			if (input.created.length === 0 || input.deleted.length === 0 || renames.size === 0) {
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

export const testViewsResolverSqlite =
	(renames: Set<string>) => async (input: ResolverInput<SqliteView>): Promise<ResolverOutputWithMoved<SqliteView>> => {
		try {
			if (input.created.length === 0 || input.deleted.length === 0 || renames.size === 0) {
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
	sqlStatementsToRun: { before?: string[]; after?: string[]; runApply?: boolean } = {
		before: [],
		after: [],
		runApply: true,
	},
) => {
	const shouldRunApply = sqlStatementsToRun.runApply === undefined ? true : sqlStatementsToRun.runApply;

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
	);

	const leftTables = Object.values(right).filter((it) => is(it, PgTable)) as PgTable[];

	const leftSchemas = Object.values(right).filter((it) => is(it, PgSchema)) as PgSchema[];

	const leftEnums = Object.values(right).filter((it) => isPgEnum(it)) as PgEnum<any>[];

	const leftSequences = Object.values(right).filter((it) => isPgSequence(it)) as PgSequence[];

	const leftViews = Object.values(right).filter((it) => isPgView(it)) as PgView[];

	const leftMaterializedViews = Object.values(right).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const serialized2 = generatePgSnapshot(
		leftTables,
		leftEnums,
		leftSchemas,
		leftSequences,
		leftViews,
		leftMaterializedViews,
		casing,
	);

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

	const sn1 = squashPgScheme(sch1, 'push');
	const sn2 = squashPgScheme(sch2, 'push');

	const validatedPrev = pgSchema.parse(sch1);
	const validatedCur = pgSchema.parse(sch2);

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements } = await applyPgSnapshotsDiff(
			sn1,
			sn2,
			testSchemasResolver(renames),
			testEnumsResolver(renames),
			testSequencesResolver(renames),
			testTablesResolver(renames),
			testColumnsResolver(renames),
			testViewsResolver(renames),
			validatedPrev,
			validatedCur,
			'push',
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
		const { sqlStatements, statements } = await applyPgSnapshotsDiff(
			sn1,
			sn2,
			schemasResolver,
			enumsResolver,
			sequencesResolver,
			tablesResolver,
			columnsResolver,
			viewsResolver,
			validatedPrev,
			validatedCur,
			'push',
		);
		return { sqlStatements, statements };
	}
};

export const applyPgDiffs = async (sn: PostgresSchema, casing: CasingType | undefined) => {
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

	const views = Object.values(sn).filter((it) => isPgView(it)) as PgView[];

	const materializedViews = Object.values(sn).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const serialized1 = generatePgSnapshot(tables, enums, schemas, sequences, views, materializedViews, casing);

	const { version: v1, dialect: d1, ...rest1 } = serialized1;

	const sch1 = {
		version: '7',
		dialect: 'postgresql',
		id: '0',
		prevId: '0',
		...rest1,
	} as const;

	const sn1 = squashPgScheme(sch1);

	const validatedPrev = pgSchema.parse(dryRun);
	const validatedCur = pgSchema.parse(sch1);

	const { sqlStatements, statements } = await applyPgSnapshotsDiff(
		dryRun,
		sn1,
		testSchemasResolver(new Set()),
		testEnumsResolver(new Set()),
		testSequencesResolver(new Set()),
		testTablesResolver(new Set()),
		testColumnsResolver(new Set()),
		testViewsResolver(new Set()),
		validatedPrev,
		validatedCur,
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

	const leftViews = Object.values(left).filter((it) => isPgView(it)) as PgView[];

	const rightViews = Object.values(right).filter((it) => isPgView(it)) as PgView[];

	const leftMaterializedViews = Object.values(left).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const rightMaterializedViews = Object.values(right).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

	const serialized1 = generatePgSnapshot(
		leftTables,
		leftEnums,
		leftSchemas,
		leftSequences,
		leftViews,
		leftMaterializedViews,
		casing,
	);
	const serialized2 = generatePgSnapshot(
		rightTables,
		rightEnums,
		rightSchemas,
		rightSequences,
		rightViews,
		rightMaterializedViews,
		casing,
	);

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

	const sn1 = squashPgScheme(sch1);
	const sn2 = squashPgScheme(sch2);

	const validatedPrev = pgSchema.parse(sch1);
	const validatedCur = pgSchema.parse(sch2);

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements } = await applyPgSnapshotsDiff(
			sn1,
			sn2,
			testSchemasResolver(renames),
			testEnumsResolver(renames),
			testSequencesResolver(renames),
			testTablesResolver(renames),
			testColumnsResolver(renames),
			testViewsResolver(renames),
			validatedPrev,
			validatedCur,
		);
		return { sqlStatements, statements };
	} else {
		const { sqlStatements, statements } = await applyPgSnapshotsDiff(
			sn1,
			sn2,
			schemasResolver,
			enumsResolver,
			sequencesResolver,
			tablesResolver,
			columnsResolver,
			viewsResolver,
			validatedPrev,
			validatedCur,
		);
		return { sqlStatements, statements };
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
			testTablesResolver(renames),
			testColumnsResolver(renames),
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

export const applyMySqlDiffs = async (sn: MysqlSchema, casing: CasingType | undefined) => {
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
		testTablesResolver(new Set()),
		testColumnsResolver(new Set()),
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
			testTablesResolver(renames),
			testColumnsResolver(renames),
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

	const serialized2 = generateSqliteSnapshot(rightTables, rightViews, casing);

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
			testTablesResolver(renames),
			testColumnsResolver(renames),
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

	const serialized2 = generateSqliteSnapshot(leftTables, leftViews, casing);

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
			testTablesResolver(renames),
			testColumnsResolver(renames),
			testViewsResolverSqlite(renames),
			sch1,
			sch2,
			'push',
		);

		const { statementsToExecute, columnsToRemove, infoToPrint, shouldAskForApprove, tablesToRemove, tablesToTruncate } =
			await libSqlLogSuggestionsAndReturn(
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

	const serialized1 = generateSqliteSnapshot(tables, views, casing);

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
		testTablesResolver(new Set()),
		testColumnsResolver(new Set()),
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

	const serialized1 = generateSqliteSnapshot(tables, views, casing);

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
		testTablesResolver(new Set()),
		testColumnsResolver(new Set()),
		testViewsResolverSqlite(new Set()),
		dryRun,
		sch1,
		action,
	);

	return { sqlStatements, statements };
};

export const diffTestSchemasSqlite = async (
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

	const serialized1 = generateSqliteSnapshot(leftTables, leftViews, casing);
	const serialized2 = generateSqliteSnapshot(rightTables, rightViews, casing);

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
		const { sqlStatements, statements } = await applySqliteSnapshotsDiff(
			sn1,
			sn2,
			testTablesResolver(renames),
			testColumnsResolver(renames),
			testViewsResolverSqlite(renames),
			sch1,
			sch2,
		);
		return { sqlStatements, statements };
	}

	const { sqlStatements, statements } = await applySqliteSnapshotsDiff(
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

	const serialized1 = generateSqliteSnapshot(leftTables, leftViews, casing);
	const serialized2 = generateSqliteSnapshot(rightTables, rightViews, casing);

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
			testTablesResolver(renames),
			testColumnsResolver(renames),
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
	);

	const { version: initV, dialect: initD, ...initRest } = introspectedSchema;

	const initSch = {
		version: '7',
		dialect: 'postgresql',
		id: '0',
		prevId: '0',
		...initRest,
	} as const;

	const initSn = squashPgScheme(initSch);
	const validatedCur = pgSchema.parse(initSch);

	// write to ts file
	const file = schemaToTypeScript(introspectedSchema, 'camel');

	fs.writeFileSync(`tests/introspect/postgres/${testName}.ts`, file.file);

	// generate snapshot from ts file
	const response = await prepareFromPgImports([`tests/introspect/postgres/${testName}.ts`]);

	const afterFileImports = generatePgSnapshot(
		response.tables,
		response.enums,
		response.schemas,
		response.sequences,
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

	const sn2AfterIm = squashPgScheme(sch2);
	const validatedCurAfterImport = pgSchema.parse(sch2);

	const { sqlStatements: afterFileSqlStatements, statements: afterFileStatements } = await applyPgSnapshotsDiff(
		initSn,
		sn2AfterIm,
		testSchemasResolver(new Set()),
		testEnumsResolver(new Set()),
		testSequencesResolver(new Set()),
		testTablesResolver(new Set()),
		testColumnsResolver(new Set()),
		testViewsResolver(new Set()),
		validatedCur,
		validatedCurAfterImport,
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

	const response = await prepareFromMySqlImports([`tests/introspect/mysql/${testName}.ts`]);

	const afterFileImports = generateMySqlSnapshot(response.tables, response.views, casing);

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

	const { sqlStatements: afterFileSqlStatements, statements: afterFileStatements } = await applyMysqlSnapshotsDiff(
		sn2AfterIm,
		initSn,
		testTablesResolver(new Set()),
		testColumnsResolver(new Set()),
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

	const response = await prepareFromSqliteImports([`tests/introspect/sqlite/${testName}.ts`]);

	const afterFileImports = generateSqliteSnapshot(response.tables, response.views, casing);

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

	const { sqlStatements: afterFileSqlStatements, statements: afterFileStatements } = await applySqliteSnapshotsDiff(
		sn2AfterIm,
		initSn,
		testTablesResolver(new Set()),
		testColumnsResolver(new Set()),
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

	const response = await prepareFromSqliteImports([`tests/introspect/libsql/${testName}.ts`]);

	const afterFileImports = generateSqliteSnapshot(response.tables, response.views, casing);

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

	const { sqlStatements: afterFileSqlStatements, statements: afterFileStatements } = await applyLibSQLSnapshotsDiff(
		sn2AfterIm,
		initSn,
		testTablesResolver(new Set()),
		testColumnsResolver(new Set()),
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
