// import { LibSQLDatabase } from 'drizzle-orm/libsql';
// import type { MySql2Database } from 'drizzle-orm/mysql2';
// import { PgDatabase } from 'drizzle-orm/pg-core';
// import { SingleStoreDriverDatabase } from 'drizzle-orm/singlestore';
// import { introspect as postgresIntrospect } from '../cli/commands/pull-postgres';
// import { sqliteIntrospect } from '../cli/commands/pull-sqlite';
// import { suggestions } from '../cli/commands/push-postgres';
// import { updateUpToV6 as upPgV6, updateUpToV7 as upPgV7 } from '../cli/commands/up-postgres';
// import { resolver } from '../cli/prompts';
// import type { CasingType } from '../cli/validations/common';
// import { ProgressView, schemaError, schemaWarning } from '../cli/views';
// import { fromDrizzleSchema, fromExports } from '../dialects/postgres/drizzle';
// import { PostgresSnapshot, toJsonSnapshot } from '../dialects/postgres/snapshot';
// import type { Config } from '../index';
// import { originUUID } from '../utils';
// import type { DB, SQLiteDB } from '../utils';
// import { getTablesFilterByExtensions } from './extensions/getTablesFilterByExtensions';

// import * as postgres from './api-postgres';

// SQLite

// TODO commented this because of build error
// export const generateSQLiteDrizzleJson = async (
// 	imports: Record<string, unknown>,
// 	prevId?: string,
// 	casing?: CasingType,
// ): Promise<SQLiteSchemaKit> => {
// 	const { prepareFromExports } = await import('./dialects/sqlite/imports');

// 	const prepared = prepareFromExports(imports);

// 	const id = randomUUID();

// 	const snapshot = fromDrizzleSchema(prepared.tables, prepared.views, casing);

// 	return {
// 		...snapshot,
// 		id,
// 		prevId: prevId ?? originUUID,
// 	};
// };

// export const generateSQLiteMigration = async (
// 	prev: DrizzleSQLiteSnapshotJSON,
// 	cur: DrizzleSQLiteSnapshotJSON,
// ) => {
// 	const { applySqliteSnapshotsDiff } = await import('./dialects/sqlite/diff');

// 	const validatedPrev = sqliteSchema.parse(prev);
// 	const validatedCur = sqliteSchema.parse(cur);

// 	const squashedPrev = squashSqliteScheme(validatedPrev);
// 	const squashedCur = squashSqliteScheme(validatedCur);

// 	const { sqlStatements } = await applySqliteSnapshotsDiff(
// 		squashedPrev,
// 		squashedCur,
// 		tablesResolver,
// 		columnsResolver,
// 		sqliteViewsResolver,
// 		validatedPrev,
// 		validatedCur,
// 	);

// 	return sqlStatements;
// };

// export const pushSQLiteSchema = async (
// 	imports: Record<string, unknown>,
// 	drizzleInstance: LibSQLDatabase<any>,
// ) => {
// 	const { applySqliteSnapshotsDiff } = await import('./dialects/sqlite/diff');
// 	const { sql } = await import('drizzle-orm');

// 	const db: SQLiteDB = {
// 		query: async (query: string, params?: any[]) => {
// 			const res = drizzleInstance.all<any>(sql.raw(query));
// 			return res;
// 		},
// 		run: async (query: string) => {
// 			return Promise.resolve(drizzleInstance.run(sql.raw(query))).then(
// 				() => {},
// 			);
// 		},
// 	};

// 	const cur = await generateSQLiteDrizzleJson(imports);
// 	const progress = new ProgressView(
// 		'Pulling schema from database...',
// 		'Pulling schema from database...',
// 	);

// 	const { schema: prev } = await sqliteIntrospect(db, [], progress);

// 	const validatedPrev = sqliteSchema.parse(prev);
// 	const validatedCur = sqliteSchema.parse(cur);

// 	const squashedPrev = squashSqliteScheme(validatedPrev, 'push');
// 	const squashedCur = squashSqliteScheme(validatedCur, 'push');

// 	const { statements, _meta } = await applySqliteSnapshotsDiff(
// 		squashedPrev,
// 		squashedCur,
// 		tablesResolver,
// 		columnsResolver,
// 		sqliteViewsResolver,
// 		validatedPrev,
// 		validatedCur,
// 		'push',
// 	);

// 	const { shouldAskForApprove, statementsToExecute, infoToPrint } = await logSuggestionsAndReturn(
// 		db,
// 		statements,
// 		squashedPrev,
// 		squashedCur,
// 		_meta!,
// 	);

// 	return {
// 		hasDataLoss: shouldAskForApprove,
// 		warnings: infoToPrint,
// 		statementsToExecute,
// 		apply: async () => {
// 			for (const dStmnt of statementsToExecute) {
// 				await db.query(dStmnt);
// 			}
// 		},
// 	};
// };

// MySQL
// TODO commented this because of build error
// export const generateMySQLDrizzleJson = async (
// 	imports: Record<string, unknown>,
// 	prevId?: string,
// 	casing?: CasingType,
// ): Promise<MySQLSchemaKit> => {
// 	const { prepareFromExports } = await import('./serializer/mysqlImports');

// 	const prepared = prepareFromExports(imports);

// 	const id = randomUUID();

// 	const snapshot = generateMySqlSnapshot(prepared.tables, prepared.views, casing);

// 	return {
// 		...snapshot,
// 		id,
// 		prevId: prevId ?? originUUID,
// 	};
// };

// export const generateMySQLMigration = async (
// 	prev: DrizzleMySQLSnapshotJSON,
// 	cur: DrizzleMySQLSnapshotJSON,
// ) => {
// 	const { ddlDiff: applyMysqlSnapshotsDiff } = await import('./dialects/mysql/mysql');

// 	const validatedPrev = mysqlSchema.parse(prev);
// 	const validatedCur = mysqlSchema.parse(cur);

// 	const squashedPrev = squashMysqlScheme(validatedPrev);
// 	const squashedCur = squashMysqlScheme(validatedCur);

// 	const { sqlStatements } = await applyMysqlSnapshotsDiff(
// 		squashedPrev,
// 		squashedCur,
// 		tablesResolver,
// 		columnsResolver,
// 		mySqlViewsResolver,
// 		uniqueResolver,
// 		validatedPrev,
// 		validatedCur,
// 	);

// 	return sqlStatements;
// };

// export const pushMySQLSchema = async (
// 	imports: Record<string, unknown>,
// 	drizzleInstance: MySql2Database<any>,
// 	databaseName: string,
// ) => {
// 	const { ddlDiff: applyMysqlSnapshotsDiff } = await import('./dialects/mysql/mysql');
// 	const { logSuggestionsAndReturn } = await import(
// 		'./cli/commands/mysqlPushUtils'
// 	);
// 	const { mysqlPushIntrospect } = await import(
// 		'./cli/commands/pull-mysql'
// 	);
// 	const { sql } = await import('drizzle-orm');

// 	const db: DB = {
// 		query: async (query: string, params?: any[]) => {
// 			const res = await drizzleInstance.execute(sql.raw(query));
// 			return res[0] as unknown as any[];
// 		},
// 	};
// 	const cur = await generateMySQLDrizzleJson(imports);
// 	const { schema: prev } = await mysqlPushIntrospect(db, databaseName, []);

// 	const validatedPrev = mysqlSchema.parse(prev);
// 	const validatedCur = mysqlSchema.parse(cur);

// 	const squashedPrev = squashMysqlScheme(validatedPrev);
// 	const squashedCur = squashMysqlScheme(validatedCur);

// 	const { statements } = await applyMysqlSnapshotsDiff(
// 		squashedPrev,
// 		squashedCur,
// 		tablesResolver,
// 		columnsResolver,
// 		mySqlViewsResolver,
// 		uniqueResolver,
// 		validatedPrev,
// 		validatedCur,
// 		'push',
// 	);

// 	const { shouldAskForApprove, statementsToExecute, infoToPrint } = await logSuggestionsAndReturn(
// 		db,
// 		statements,
// 		validatedCur,
// 	);

// 	return {
// 		hasDataLoss: shouldAskForApprove,
// 		warnings: infoToPrint,
// 		statementsToExecute,
// 		apply: async () => {
// 			for (const dStmnt of statementsToExecute) {
// 				await db.query(dStmnt);
// 			}
// 		},
// 	};
// };

// SingleStore
// TODO commented this because of build error
// export const generateSingleStoreDrizzleJson = async (
// 	imports: Record<string, unknown>,
// 	prevId?: string,
// 	casing?: CasingType,
// ): Promise<SingleStoreSchemaKit> => {
// 	const { prepareFromExports } = await import('./serializer/singlestoreImports');

// 	const prepared = prepareFromExports(imports);

// 	const id = randomUUID();

// 	const snapshot = generateSingleStoreSnapshot(prepared.tables, /* prepared.views, */ casing);

// 	return {
// 		...snapshot,
// 		id,
// 		prevId: prevId ?? originUUID,
// 	};
// };

// export const generateSingleStoreMigration = async (
// 	prev: DrizzleSingleStoreSnapshotJSON,
// 	cur: DrizzleSingleStoreSnapshotJSON,
// ) => {
// 	const { applySingleStoreSnapshotsDiff } = await import('./snapshot-differ/singlestore');

// 	const validatedPrev = singlestoreSchema.parse(prev);
// 	const validatedCur = singlestoreSchema.parse(cur);

// 	const squashedPrev = squashSingleStoreScheme(validatedPrev);
// 	const squashedCur = squashSingleStoreScheme(validatedCur);

// 	const { sqlStatements } = await applySingleStoreSnapshotsDiff(
// 		squashedPrev,
// 		squashedCur,
// 		tablesResolver,
// 		columnsResolver,
// 		/* singleStoreViewsResolver, */
// 		validatedPrev,
// 		validatedCur,
// 		'push',
// 	);

// 	return sqlStatements;
// };

// export const pushSingleStoreSchema = async (
// 	imports: Record<string, unknown>,
// 	drizzleInstance: SingleStoreDriverDatabase<any>,
// 	databaseName: string,
// ) => {
// 	const { applySingleStoreSnapshotsDiff } = await import('./snapshot-differ/singlestore');
// 	const { logSuggestionsAndReturn } = await import(
// 		'./cli/commands/singlestorePushUtils'
// 	);
// 	const { singlestorePushIntrospect } = await import(
// 		'./cli/commands/pull-singlestore'
// 	);
// 	const { sql } = await import('drizzle-orm');

// 	const db: DB = {
// 		query: async (query: string) => {
// 			const res = await drizzleInstance.execute(sql.raw(query));
// 			return res[0] as unknown as any[];
// 		},
// 	};
// 	const cur = await generateSingleStoreDrizzleJson(imports);
// 	const { schema: prev } = await singlestorePushIntrospect(db, databaseName, []);

// 	const validatedPrev = singlestoreSchema.parse(prev);
// 	const validatedCur = singlestoreSchema.parse(cur);

// 	const squashedPrev = squashSingleStoreScheme(validatedPrev);
// 	const squashedCur = squashSingleStoreScheme(validatedCur);

// 	const { statements } = await applySingleStoreSnapshotsDiff(
// 		squashedPrev,
// 		squashedCur,
// 		tablesResolver,
// 		columnsResolver,
// 		/* singleStoreViewsResolver, */
// 		validatedPrev,
// 		validatedCur,
// 		'push',
// 	);

// 	const { shouldAskForApprove, statementsToExecute, infoToPrint } = await logSuggestionsAndReturn(
// 		db,
// 		statements,
// 		validatedCur,
// 		validatedPrev,
// 	);

// 	return {
// 		hasDataLoss: shouldAskForApprove,
// 		warnings: infoToPrint,
// 		statementsToExecute,
// 		apply: async () => {
// 			for (const dStmnt of statementsToExecute) {
// 				await db.query(dStmnt);
// 			}
// 		},
// 	};
// };
