import { Client } from '@libsql/client/.';
import { is } from 'drizzle-orm';
import { MySqlTable, MySqlView } from 'drizzle-orm/mysql-core';
import { SingleStoreSchema, SingleStoreTable } from 'drizzle-orm/singlestore-core';
import { SQLiteTable, SQLiteView } from 'drizzle-orm/sqlite-core';
import { Connection } from 'mysql2/promise';
import { CasingType } from 'src/cli/validations/common';
import { ddlToTypescript as schemaToTypeScriptSQLite } from 'src/dialects/sqlite/typescript';
import { schemaToTypeScript as schemaToTypeScriptMySQL } from 'src/introspect-mysql';
import { schemaToTypeScript as schemaToTypeScriptSingleStore } from 'src/introspect-singlestore';
import { prepareFromMySqlImports } from 'src/serializer/mysqlImports';
import { mysqlSchema, squashMysqlScheme } from 'src/serializer/mysqlSchema';
import { fromDatabase as fromMySqlDatabase, generateMySqlSnapshot } from 'src/serializer/mysqlSerializer';
import { prepareFromSingleStoreImports } from 'src/serializer/singlestoreImports';
import { singlestoreSchema, squashSingleStoreScheme } from 'src/serializer/singlestoreSchema';
import {
	fromDatabase as fromSingleStoreDatabase,
	generateSingleStoreSnapshot,
} from 'src/serializer/singlestoreSerializer';


export type SinglestoreSchema = Record<
	string,
	SingleStoreTable<any> | SingleStoreSchema /* | SingleStoreView */
>;


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
