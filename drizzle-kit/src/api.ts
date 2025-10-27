import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'crypto';
import { is } from 'drizzle-orm';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import { AnyMySqlTable, getTableConfig as mysqlTableConfig, MySqlTable } from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { AnyPgTable, getTableConfig as pgTableConfig, PgDatabase, PgTable } from 'drizzle-orm/pg-core';
import { Relations } from 'drizzle-orm/relations';
import { SingleStoreDriverDatabase } from 'drizzle-orm/singlestore';
import {
	AnySingleStoreTable,
	getTableConfig as singlestoreTableConfig,
	SingleStoreTable,
} from 'drizzle-orm/singlestore-core';
import { AnySQLiteTable, SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
	columnsResolver,
	enumsResolver,
	indPolicyResolver,
	mySqlViewsResolver,
	policyResolver,
	roleResolver,
	schemasResolver,
	sequencesResolver,
	sqliteViewsResolver,
	tablesResolver,
	viewsResolver,
} from './cli/commands/migrate';
import { pgPushIntrospect } from './cli/commands/pgIntrospect';
import { pgSuggestions } from './cli/commands/pgPushUtils';
import { updateUpToV6 as upPgV6, updateUpToV7 as upPgV7 } from './cli/commands/pgUp';
import { sqlitePushIntrospect } from './cli/commands/sqliteIntrospect';
import { logSuggestionsAndReturn } from './cli/commands/sqlitePushUtils';
import type { CasingType } from './cli/validations/common';
import type { MysqlCredentials } from './cli/validations/mysql';
import type { PostgresCredentials } from './cli/validations/postgres';
import type { SingleStoreCredentials } from './cli/validations/singlestore';
import type { SqliteCredentials } from './cli/validations/sqlite';
import { getTablesFilterByExtensions } from './extensions/getTablesFilterByExtensions';
import { originUUID } from './global';
import type { Config } from './index';
import { MySqlSchema as MySQLSchemaKit, mysqlSchema, squashMysqlScheme } from './serializer/mysqlSchema';
import { generateMySqlSnapshot } from './serializer/mysqlSerializer';
import { prepareFromExports } from './serializer/pgImports';
import { PgSchema as PgSchemaKit, pgSchema, squashPgScheme } from './serializer/pgSchema';
import { generatePgSnapshot } from './serializer/pgSerializer';
import {
	SingleStoreSchema as SingleStoreSchemaKit,
	singlestoreSchema,
	squashSingleStoreScheme,
} from './serializer/singlestoreSchema';
import { generateSingleStoreSnapshot } from './serializer/singlestoreSerializer';
import { SQLiteSchema as SQLiteSchemaKit, sqliteSchema, squashSqliteScheme } from './serializer/sqliteSchema';
import { generateSqliteSnapshot } from './serializer/sqliteSerializer';
import type { Setup } from './serializer/studio';
import type { DB, SQLiteDB } from './utils';
import { certs } from './utils/certs';
export type DrizzleSnapshotJSON = PgSchemaKit;
export type DrizzleSQLiteSnapshotJSON = SQLiteSchemaKit;
export type DrizzleMySQLSnapshotJSON = MySQLSchemaKit;
export type DrizzleSingleStoreSnapshotJSON = SingleStoreSchemaKit;

export const generateDrizzleJson = (
	imports: Record<string, unknown>,
	prevId?: string,
	schemaFilters?: string[],
	casing?: CasingType,
): PgSchemaKit => {
	const prepared = prepareFromExports(imports);

	const id = randomUUID();

	const snapshot = generatePgSnapshot(
		prepared.tables,
		prepared.enums,
		prepared.schemas,
		prepared.sequences,
		prepared.roles,
		prepared.policies,
		prepared.views,
		prepared.matViews,
		casing,
		schemaFilters,
	);

	return {
		...snapshot,
		id,
		prevId: prevId ?? originUUID,
	};
};

export const generateMigration = async (
	prev: DrizzleSnapshotJSON,
	cur: DrizzleSnapshotJSON,
) => {
	const { applyPgSnapshotsDiff } = await import('./snapshotsDiffer');

	const validatedPrev = pgSchema.parse(prev);
	const validatedCur = pgSchema.parse(cur);

	const squashedPrev = squashPgScheme(validatedPrev);
	const squashedCur = squashPgScheme(validatedCur);

	const { sqlStatements, _meta } = await applyPgSnapshotsDiff(
		squashedPrev,
		squashedCur,
		schemasResolver,
		enumsResolver,
		sequencesResolver,
		policyResolver,
		indPolicyResolver,
		roleResolver,
		tablesResolver,
		columnsResolver,
		viewsResolver,
		validatedPrev,
		validatedCur,
	);

	return sqlStatements;
};

export const pushSchema = async (
	imports: Record<string, unknown>,
	drizzleInstance: PgDatabase<any>,
	schemaFilters?: string[],
	tablesFilter?: string[],
	extensionsFilters?: Config['extensionsFilters'],
) => {
	const { applyPgSnapshotsDiff } = await import('./snapshotsDiffer');
	const { sql } = await import('drizzle-orm');
	const filters = (tablesFilter ?? []).concat(
		getTablesFilterByExtensions({ extensionsFilters, dialect: 'postgresql' }),
	);

	const db: DB = {
		query: async (query: string, params?: any[]) => {
			const res = await drizzleInstance.execute(sql.raw(query));
			return res.rows;
		},
	};

	const cur = generateDrizzleJson(imports);
	const { schema: prev } = await pgPushIntrospect(
		db,
		filters,
		schemaFilters ?? ['public'],
		undefined,
	);

	const validatedPrev = pgSchema.parse(prev);
	const validatedCur = pgSchema.parse(cur);

	const squashedPrev = squashPgScheme(validatedPrev, 'push');
	const squashedCur = squashPgScheme(validatedCur, 'push');

	const { statements } = await applyPgSnapshotsDiff(
		squashedPrev,
		squashedCur,
		schemasResolver,
		enumsResolver,
		sequencesResolver,
		policyResolver,
		indPolicyResolver,
		roleResolver,
		tablesResolver,
		columnsResolver,
		viewsResolver,
		validatedPrev,
		validatedCur,
		'push',
	);

	const { shouldAskForApprove, statementsToExecute, infoToPrint } = await pgSuggestions(db, statements);

	return {
		hasDataLoss: shouldAskForApprove,
		warnings: infoToPrint,
		statementsToExecute,
		apply: async () => {
			for (const dStmnt of statementsToExecute) {
				await db.query(dStmnt);
			}
		},
	};
};

export const startStudioPostgresServer = async (
	imports: Record<string, unknown>,
	credentials: PostgresCredentials | {
		driver: 'pglite';
		client: PGlite;
	},
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
	},
) => {
	const { drizzleForPostgres } = await import('./serializer/studio');

	const pgSchema: Record<string, Record<string, AnyPgTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, PgTable)) {
			const schema = pgTableConfig(t).schema || 'public';
			pgSchema[schema] = pgSchema[schema] || {};
			pgSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForPostgres(credentials, pgSchema, relations, [], options?.casing);
	await startServerFromSetup(setup, options);
};

// SQLite

export const generateSQLiteDrizzleJson = async (
	imports: Record<string, unknown>,
	prevId?: string,
	casing?: CasingType,
): Promise<SQLiteSchemaKit> => {
	const { prepareFromExports } = await import('./serializer/sqliteImports');

	const prepared = prepareFromExports(imports);

	const id = randomUUID();

	const snapshot = generateSqliteSnapshot(prepared.tables, prepared.views, casing);

	return {
		...snapshot,
		id,
		prevId: prevId ?? originUUID,
	};
};

export const generateSQLiteMigration = async (
	prev: DrizzleSQLiteSnapshotJSON,
	cur: DrizzleSQLiteSnapshotJSON,
) => {
	const { applySqliteSnapshotsDiff } = await import('./snapshotsDiffer');

	const validatedPrev = sqliteSchema.parse(prev);
	const validatedCur = sqliteSchema.parse(cur);

	const squashedPrev = squashSqliteScheme(validatedPrev);
	const squashedCur = squashSqliteScheme(validatedCur);

	const { sqlStatements } = await applySqliteSnapshotsDiff(
		squashedPrev,
		squashedCur,
		tablesResolver,
		columnsResolver,
		sqliteViewsResolver,
		validatedPrev,
		validatedCur,
	);

	return sqlStatements;
};

export const pushSQLiteSchema = async (
	imports: Record<string, unknown>,
	drizzleInstance: LibSQLDatabase<any>,
) => {
	const { applySqliteSnapshotsDiff } = await import('./snapshotsDiffer');
	const { sql } = await import('drizzle-orm');

	const db: SQLiteDB = {
		query: async (query: string, params?: any[]) => {
			const res = drizzleInstance.all<any>(sql.raw(query));
			return res;
		},
		run: async (query: string) => {
			return Promise.resolve(drizzleInstance.run(sql.raw(query))).then(
				() => {},
			);
		},
	};

	const cur = await generateSQLiteDrizzleJson(imports);
	const { schema: prev } = await sqlitePushIntrospect(db, []);

	const validatedPrev = sqliteSchema.parse(prev);
	const validatedCur = sqliteSchema.parse(cur);

	const squashedPrev = squashSqliteScheme(validatedPrev, 'push');
	const squashedCur = squashSqliteScheme(validatedCur, 'push');

	const { statements, _meta } = await applySqliteSnapshotsDiff(
		squashedPrev,
		squashedCur,
		tablesResolver,
		columnsResolver,
		sqliteViewsResolver,
		validatedPrev,
		validatedCur,
		'push',
	);

	const { shouldAskForApprove, statementsToExecute, infoToPrint } = await logSuggestionsAndReturn(
		db,
		statements,
		squashedPrev,
		squashedCur,
		_meta!,
	);

	return {
		hasDataLoss: shouldAskForApprove,
		warnings: infoToPrint,
		statementsToExecute,
		apply: async () => {
			for (const dStmnt of statementsToExecute) {
				await db.query(dStmnt);
			}
		},
	};
};

export const startStudioSQLiteServer = async (
	imports: Record<string, unknown>,
	credentials: SqliteCredentials,
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
	},
) => {
	const { drizzleForSQLite } = await import('./serializer/studio');

	const sqliteSchema: Record<string, Record<string, AnySQLiteTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, SQLiteTable)) {
			const schema = 'public'; // sqlite does not have schemas
			sqliteSchema[schema] = sqliteSchema[schema] || {};
			sqliteSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForSQLite(credentials, sqliteSchema, relations, [], options?.casing);
	await startServerFromSetup(setup, options);
};

// MySQL

export const generateMySQLDrizzleJson = async (
	imports: Record<string, unknown>,
	prevId?: string,
	casing?: CasingType,
): Promise<MySQLSchemaKit> => {
	const { prepareFromExports } = await import('./serializer/mysqlImports');

	const prepared = prepareFromExports(imports);

	const id = randomUUID();

	const snapshot = generateMySqlSnapshot(prepared.tables, prepared.views, casing);

	return {
		...snapshot,
		id,
		prevId: prevId ?? originUUID,
	};
};

export const generateMySQLMigration = async (
	prev: DrizzleMySQLSnapshotJSON,
	cur: DrizzleMySQLSnapshotJSON,
) => {
	const { applyMysqlSnapshotsDiff } = await import('./snapshotsDiffer');

	const validatedPrev = mysqlSchema.parse(prev);
	const validatedCur = mysqlSchema.parse(cur);

	const squashedPrev = squashMysqlScheme(validatedPrev);
	const squashedCur = squashMysqlScheme(validatedCur);

	const { sqlStatements } = await applyMysqlSnapshotsDiff(
		squashedPrev,
		squashedCur,
		tablesResolver,
		columnsResolver,
		mySqlViewsResolver,
		validatedPrev,
		validatedCur,
	);

	return sqlStatements;
};

export const pushMySQLSchema = async (
	imports: Record<string, unknown>,
	drizzleInstance: MySql2Database<any>,
	databaseName: string,
) => {
	const { applyMysqlSnapshotsDiff } = await import('./snapshotsDiffer');
	const { logSuggestionsAndReturn } = await import(
		'./cli/commands/mysqlPushUtils'
	);
	const { mysqlPushIntrospect } = await import(
		'./cli/commands/mysqlIntrospect'
	);
	const { sql } = await import('drizzle-orm');

	const db: DB = {
		query: async (query: string, params?: any[]) => {
			const res = await drizzleInstance.execute(sql.raw(query));
			return res[0] as unknown as any[];
		},
	};
	const cur = await generateMySQLDrizzleJson(imports);
	const { schema: prev } = await mysqlPushIntrospect(db, databaseName, []);

	const validatedPrev = mysqlSchema.parse(prev);
	const validatedCur = mysqlSchema.parse(cur);

	const squashedPrev = squashMysqlScheme(validatedPrev);
	const squashedCur = squashMysqlScheme(validatedCur);

	const { statements } = await applyMysqlSnapshotsDiff(
		squashedPrev,
		squashedCur,
		tablesResolver,
		columnsResolver,
		mySqlViewsResolver,
		validatedPrev,
		validatedCur,
		'push',
	);

	const { shouldAskForApprove, statementsToExecute, infoToPrint } = await logSuggestionsAndReturn(
		db,
		statements,
		validatedCur,
	);

	return {
		hasDataLoss: shouldAskForApprove,
		warnings: infoToPrint,
		statementsToExecute,
		apply: async () => {
			for (const dStmnt of statementsToExecute) {
				await db.query(dStmnt);
			}
		},
	};
};

export const startStudioMySQLServer = async (
	imports: Record<string, unknown>,
	credentials: MysqlCredentials,
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
	},
) => {
	const { drizzleForMySQL } = await import('./serializer/studio');

	const mysqlSchema: Record<string, Record<string, AnyMySqlTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, MySqlTable)) {
			const schema = mysqlTableConfig(t).schema || 'public';
			mysqlSchema[schema] = mysqlSchema[schema] || {};
			mysqlSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForMySQL(credentials, mysqlSchema, relations, [], options?.casing);
	await startServerFromSetup(setup, options);
};

// SingleStore

export const generateSingleStoreDrizzleJson = async (
	imports: Record<string, unknown>,
	prevId?: string,
	casing?: CasingType,
): Promise<SingleStoreSchemaKit> => {
	const { prepareFromExports } = await import('./serializer/singlestoreImports');

	const prepared = prepareFromExports(imports);

	const id = randomUUID();

	const snapshot = generateSingleStoreSnapshot(prepared.tables, /* prepared.views, */ casing);

	return {
		...snapshot,
		id,
		prevId: prevId ?? originUUID,
	};
};

export const generateSingleStoreMigration = async (
	prev: DrizzleSingleStoreSnapshotJSON,
	cur: DrizzleSingleStoreSnapshotJSON,
) => {
	const { applySingleStoreSnapshotsDiff } = await import('./snapshotsDiffer');

	const validatedPrev = singlestoreSchema.parse(prev);
	const validatedCur = singlestoreSchema.parse(cur);

	const squashedPrev = squashSingleStoreScheme(validatedPrev);
	const squashedCur = squashSingleStoreScheme(validatedCur);

	const { sqlStatements } = await applySingleStoreSnapshotsDiff(
		squashedPrev,
		squashedCur,
		tablesResolver,
		columnsResolver,
		/* singleStoreViewsResolver, */
		validatedPrev,
		validatedCur,
		'push',
	);

	return sqlStatements;
};

export const pushSingleStoreSchema = async (
	imports: Record<string, unknown>,
	drizzleInstance: SingleStoreDriverDatabase<any>,
	databaseName: string,
) => {
	const { applySingleStoreSnapshotsDiff } = await import('./snapshotsDiffer');
	const { logSuggestionsAndReturn } = await import(
		'./cli/commands/singlestorePushUtils'
	);
	const { singlestorePushIntrospect } = await import(
		'./cli/commands/singlestoreIntrospect'
	);
	const { sql } = await import('drizzle-orm');

	const db: DB = {
		query: async (query: string) => {
			const res = await drizzleInstance.execute(sql.raw(query));
			return res[0] as unknown as any[];
		},
	};
	const cur = await generateSingleStoreDrizzleJson(imports);
	const { schema: prev } = await singlestorePushIntrospect(db, databaseName, []);

	const validatedPrev = singlestoreSchema.parse(prev);
	const validatedCur = singlestoreSchema.parse(cur);

	const squashedPrev = squashSingleStoreScheme(validatedPrev);
	const squashedCur = squashSingleStoreScheme(validatedCur);

	const { statements } = await applySingleStoreSnapshotsDiff(
		squashedPrev,
		squashedCur,
		tablesResolver,
		columnsResolver,
		/* singleStoreViewsResolver, */
		validatedPrev,
		validatedCur,
		'push',
	);

	const { shouldAskForApprove, statementsToExecute, infoToPrint } = await logSuggestionsAndReturn(
		db,
		statements,
		validatedCur,
		validatedPrev,
	);

	return {
		hasDataLoss: shouldAskForApprove,
		warnings: infoToPrint,
		statementsToExecute,
		apply: async () => {
			for (const dStmnt of statementsToExecute) {
				await db.query(dStmnt);
			}
		},
	};
};

export const startStudioSingleStoreServer = async (
	imports: Record<string, unknown>,
	credentials: SingleStoreCredentials,
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
	},
) => {
	const { drizzleForSingleStore } = await import('./serializer/studio');

	const singleStoreSchema: Record<string, Record<string, AnySingleStoreTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, SingleStoreTable)) {
			const schema = singlestoreTableConfig(t).schema || 'public';
			singleStoreSchema[schema] = singleStoreSchema[schema] || {};
			singleStoreSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForSingleStore(credentials, singleStoreSchema, relations, [], options?.casing);
	await startServerFromSetup(setup, options);
};

const startServerFromSetup = async (setup: Setup, options?: {
	host?: string;
	port?: number;
}) => {
	const { prepareServer } = await import('./serializer/studio');

	const server = await prepareServer(setup);

	const host = options?.host || '127.0.0.1';
	const port = options?.port || 4983;
	const { key, cert } = (await certs()) || {};
	server.start({
		host,
		port,
		key,
		cert,
		cb: (err) => {
			if (err) {
				console.error(err);
			} else {
				console.log(`Studio is running at ${key ? 'https' : 'http'}://${host}:${port}`);
			}
		},
	});
};

export const upPgSnapshot = (snapshot: Record<string, unknown>) => {
	if (snapshot.version === '5') {
		return upPgV7(upPgV6(snapshot));
	}
	if (snapshot.version === '6') {
		return upPgV7(snapshot);
	}
	return snapshot;
};
