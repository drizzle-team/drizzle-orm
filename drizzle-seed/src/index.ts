import { entityKind, getTableName, is, sql } from 'drizzle-orm';

import type { MySqlColumn, MySqlSchema } from 'drizzle-orm/mysql-core';
import { getTableConfig as getMysqlTableConfig, MySqlDatabase, MySqlTable } from 'drizzle-orm/mysql-core';

import type { PgColumn, PgSchema } from 'drizzle-orm/pg-core';
import { getTableConfig as getPgTableConfig, PgDatabase, PgTable } from 'drizzle-orm/pg-core';

import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { BaseSQLiteDatabase, getTableConfig as getSqliteTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { AbstractGenerator } from './services/GeneratorsWrappers.ts';
import { generatorsFuncs } from './services/GeneratorsWrappers.ts';
import seedService from './services/SeedService.ts';
import type { DrizzleStudioObjectType, DrizzleStudioRelationType } from './types/drizzleStudio.ts';
import type { RefinementsType } from './types/seedService.ts';
import type { Relation, Table } from './types/tables.ts';

type InferCallbackType<
	DB extends
		| PgDatabase<any, any, any, any>
		| MySqlDatabase<any, any, any, any>
		| BaseSQLiteDatabase<any, any, any, any>,
	SCHEMA extends {
		[key: string]: PgTable | PgSchema | MySqlTable | MySqlSchema | SQLiteTable;
	},
> = DB extends PgDatabase<any, any, any, any> ? SCHEMA extends {
		[key: string]:
			| PgTable
			| PgSchema
			| MySqlTable
			| MySqlSchema
			| SQLiteTable;
	} ? {
			// iterates through schema fields. example -> schema: {"tableName": PgTable}
			[
				table in keyof SCHEMA as SCHEMA[table] extends PgTable ? table
					: never
			]?: {
				count?: number;
				columns?: {
					// iterates through table fields. example -> table: {"columnName": PgColumn}
					[
						column in keyof SCHEMA[table] as SCHEMA[table][column] extends PgColumn ? column
							: never
					]?: AbstractGenerator<any>;
				};
				with?: {
					[
						refTable in keyof SCHEMA as SCHEMA[refTable] extends PgTable ? refTable
							: never
					]?:
						| number
						| { weight: number; count: number | number[] }[];
				};
			};
		}
	: {}
	: DB extends MySqlDatabase<any, any, any, any> ? SCHEMA extends {
			[key: string]:
				| PgTable
				| PgSchema
				| MySqlTable
				| MySqlSchema
				| SQLiteTable;
		} ? {
				// iterates through schema fields. example -> schema: {"tableName": MySqlTable}
				[
					table in keyof SCHEMA as SCHEMA[table] extends MySqlTable ? table
						: never
				]?: {
					count?: number;
					columns?: {
						// iterates through table fields. example -> table: {"columnName": MySqlColumn}
						[
							column in keyof SCHEMA[table] as SCHEMA[table][column] extends MySqlColumn ? column
								: never
						]?: AbstractGenerator<any>;
					};
					with?: {
						[
							refTable in keyof SCHEMA as SCHEMA[refTable] extends MySqlTable ? refTable
								: never
						]?:
							| number
							| { weight: number; count: number | number[] }[];
					};
				};
			}
		: {}
	: DB extends BaseSQLiteDatabase<any, any, any, any> ? SCHEMA extends {
			[key: string]:
				| PgTable
				| PgSchema
				| MySqlTable
				| MySqlSchema
				| SQLiteTable;
		} ? {
				// iterates through schema fields. example -> schema: {"tableName": SQLiteTable}
				[
					table in keyof SCHEMA as SCHEMA[table] extends SQLiteTable ? table
						: never
				]?: {
					count?: number;
					columns?: {
						// iterates through table fields. example -> table: {"columnName": SQLiteColumn}
						[
							column in keyof SCHEMA[table] as SCHEMA[table][column] extends SQLiteColumn ? column
								: never
						]?: AbstractGenerator<any>;
					};
					with?: {
						[
							refTable in keyof SCHEMA as SCHEMA[refTable] extends SQLiteTable ? refTable
								: never
						]?:
							| number
							| { weight: number; count: number | number[] }[];
					};
				};
			}
		: {}
	: {};

class SeedPromise<
	DB extends
		| PgDatabase<any, any, any, any>
		| MySqlDatabase<any, any, any, any>
		| BaseSQLiteDatabase<any, any, any, any>,
	SCHEMA extends {
		[key: string]: PgTable | PgSchema | MySqlTable | MySqlSchema | SQLiteTable;
	},
> implements Promise<void> {
	static readonly [entityKind]: string = 'SeedPromise';

	[Symbol.toStringTag] = 'SeedPromise';

	constructor(
		private db: DB,
		private schema: SCHEMA,
		private options?: { count?: number; seed?: number },
	) {}

	then<TResult1 = void, TResult2 = never>(
		onfulfilled?:
			| ((value: void) => TResult1 | PromiseLike<TResult1>)
			| null
			| undefined,
		onrejected?:
			| ((reason: any) => TResult2 | PromiseLike<TResult2>)
			| null
			| undefined,
	): Promise<TResult1 | TResult2> {
		return seedFunc(this.db, this.schema, this.options).then(
			onfulfilled,
			onrejected,
		);
	}

	catch<TResult = never>(
		onrejected?:
			| ((reason: any) => TResult | PromiseLike<TResult>)
			| null
			| undefined,
	): Promise<void | TResult> {
		return this.then(undefined, onrejected);
	}

	finally(onfinally?: (() => void) | null | undefined): Promise<void> {
		return this.then(
			(value) => {
				onfinally?.();
				return value;
			},
			(reason) => {
				onfinally?.();
				throw reason;
			},
		);
	}

	async refine(
		callback: (funcs: typeof generatorsFuncs) => InferCallbackType<DB, SCHEMA>,
	): Promise<void> {
		const refinements = callback(generatorsFuncs) as RefinementsType;

		await seedFunc(this.db, this.schema, this.options, refinements);
	}
}

export function getGeneratorsFunctions() {
	return generatorsFuncs;
}

export async function seedForDrizzleStudio(
	{ sqlDialect, drizzleStudioObject, drizzleStudioRelations, schemasRefinements, options }: {
		sqlDialect: 'postgresql' | 'mysql' | 'sqlite';
		drizzleStudioObject: DrizzleStudioObjectType;
		drizzleStudioRelations: DrizzleStudioRelationType[];
		schemasRefinements?: { [schemaName: string]: RefinementsType };
		options?: { count?: number; seed?: number };
	},
) {
	const generatedSchemas: {
		[schemaName: string]: {
			tables: {
				tableName: string;
				rows: {
					[columnName: string]: string | number | boolean | undefined;
				}[];
			}[];
		};
	} = {};

	let tables: Table[], relations: Relation[], refinements: RefinementsType | undefined;
	drizzleStudioRelations = drizzleStudioRelations.filter((rel) => rel.type === 'one');
	for (const [schemaName, { tables: drizzleStudioTables }] of Object.entries(drizzleStudioObject)) {
		tables = [];
		for (const [tableName, table] of Object.entries(drizzleStudioTables)) {
			const drizzleStudioColumns = Object.values(table.columns);
			const columns = drizzleStudioColumns.map((col) => ({
				name: col.name,
				dataType: 'string',
				columnType: col.type,
				default: col.default,
				hasDefault: col.default === undefined ? false : true,
				isUnique: col.isUnique === undefined ? false : col.isUnique,
				notNull: col.notNull,
			}));
			tables.push(
				{
					name: tableName,
					columns,
					primaryKeys: drizzleStudioColumns.filter((col) => col.primaryKey === true).map((col) => col.name),
				},
			);
		}

		relations = drizzleStudioRelations.filter((rel) => rel.schema === schemaName && rel.refSchema === schemaName);

		refinements = schemasRefinements !== undefined && schemasRefinements[schemaName] !== undefined
			? schemasRefinements[schemaName]
			: undefined;

		const generatedTablesGenerators = seedService.generatePossibleGenerators(
			sqlDialect,
			tables,
			relations,
			refinements,
			options,
		);

		const generatedTables = await seedService.generateTablesValues(
			relations,
			generatedTablesGenerators,
			undefined,
			undefined,
			{ ...options, preserveData: true, insertDataInDb: false },
		);

		generatedSchemas[schemaName] = { tables: generatedTables };
	}

	return generatedSchemas;
}

/**
 * @param db - database you would like to seed.
 * @param schema - object that contains all your database tables you would like to seed.
 * @param options - object that contains properties `count` and `seed`:
 *
 *  `count` - number of rows you want to generate.
 *
 *  `seed` - a number that controls the state of generated data. (if the `seed` number is the same and nothing is changed in the seeding script, generated data will remain the same each time you seed database)
 *
 * @returns SeedPromise - a class object that has a refine method that is used to change generators for columns.
 *
 * @example
 * ```ts
 * // base seeding
 * await seed(db, schema);
 *
 * // seeding with count specified
 * await seed(db, schema, { count: 100000 });
 *
 * // seeding with count and seed specified
 * await seed(db, schema, { count: 100000, seed: 1 });
 *
 * //seeding using refine
 * await seed(db, schema, { count: 1000 }).refine((funcs) => ({
 *   users: {
 *     columns: {
 *       name: funcs.firstName({ isUnique: true }),
 *       email: funcs.email(),
 *       phone: funcs.phoneNumber({ template: "+380 99 ###-##-##" }),
 *       password: funcs.string({ isUnique: true }),
 *     },
 *     count: 100000,
 *   },
 *   posts: {
 *     columns: {
 *       title: funcs.valuesFromArray({
 *         values: ["Title1", "Title2", "Title3", "Title4", "Title5"],
 *       }),
 *       content: funcs.loremIpsum({ sentencesCount: 3 }),
 *     },
 *   },
 * }));
 *
 * ```
 */
export function seed<
	DB extends
		| PgDatabase<any, any, any, any>
		| MySqlDatabase<any, any, any, any>
		| BaseSQLiteDatabase<any, any, any, any>,
	SCHEMA extends {
		[key: string]:
			| PgTable
			| PgSchema
			| MySqlTable
			| MySqlSchema
			| SQLiteTable
			| any;
	},
>(db: DB, schema: SCHEMA, options?: { count?: number; seed?: number }) {
	return new SeedPromise<typeof db, typeof schema>(db, schema, options);
}

const seedFunc = async (
	db: PgDatabase<any, any, any, any> | MySqlDatabase<any, any, any, any> | BaseSQLiteDatabase<any, any, any, any>,
	schema: {
		[key: string]:
			| PgTable
			| PgSchema
			| MySqlTable
			| MySqlSchema
			| SQLiteTable
			| any;
	},
	options: { count?: number; seed?: number } = {},
	refinements?: RefinementsType,
) => {
	if (is(db, PgDatabase<any, any, any, any>)) {
		const { pgSchema } = filterPgTables(schema);

		await seedPostgres(db, pgSchema, options, refinements);
	} else if (is(db, MySqlDatabase<any, any, any, any>)) {
		const { mySqlSchema } = filterMySqlTables(schema);

		await seedMySql(db, mySqlSchema, options, refinements);
	} else if (is(db, BaseSQLiteDatabase<any, any, any, any>)) {
		const { sqliteSchema } = filterSqliteTables(schema);

		await seedSqlite(db, sqliteSchema, options, refinements);
	} else {
		throw new Error(
			'The drizzle-seed package currently supports only PostgreSQL, MySQL, and SQLite databases. Please ensure your database is one of these supported types',
		);
	}

	return;
};

/**
 * deletes all data from specified tables
 *
 * @param db - database you would like to reset.
 * @param schema - object that contains all your database tables you would like to delete data from.
 *
 * `If db is a PgDatabase object`, we will execute sql query and delete data from your tables the following way:
 * ```sql
 * truncate tableName1, tableName2, ... cascade;
 * ```
 *
 * `If db is a MySqlDatabase object`, we will execute sql queries and delete data from your tables the following way:
 * ```sql
 * SET FOREIGN_KEY_CHECKS = 0;
 * truncate tableName1;
 * truncate tableName2;
 * .
 * .
 * .
 *
 * SET FOREIGN_KEY_CHECKS = 1;
 * ```
 *
 * `If db is a BaseSQLiteDatabase object`, we will execute sql queries and delete data from your tables the following way:
 * ```sql
 * PRAGMA foreign_keys = OFF;
 * delete from tableName1;
 * delete from tableName2;
 * .
 * .
 * .
 *
 * PRAGMA foreign_keys = ON;
 * ```
 *
 * @example
 * ```ts
 * await reset(db, schema);
 * ```
 */
export async function reset<
	DB extends
		| PgDatabase<any, any, any, any>
		| MySqlDatabase<any, any, any, any>
		| BaseSQLiteDatabase<any, any, any, any>,
	SCHEMA extends {
		[key: string]:
			| PgTable
			| PgSchema
			| MySqlTable
			| MySqlSchema
			| SQLiteTable
			| any;
	},
>(db: DB, schema: SCHEMA) {
	if (is(db, PgDatabase<any, any, any, any>)) {
		const { pgSchema } = filterPgTables(schema);

		if (Object.entries(pgSchema).length > 0) {
			await resetPostgres(db, pgSchema);
		}
	} else if (is(db, MySqlDatabase<any, any, any, any>)) {
		const { mySqlSchema } = filterMySqlTables(schema);

		if (Object.entries(mySqlSchema).length > 0) {
			await resetMySql(db, mySqlSchema);
		}
	} else if (is(db, BaseSQLiteDatabase<any, any, any, any>)) {
		const { sqliteSchema } = filterSqliteTables(schema);

		if (Object.entries(sqliteSchema).length > 0) {
			await resetSqlite(db, sqliteSchema);
		}
	} else {
		throw new Error(
			'The drizzle-seed package currently supports only PostgreSQL, MySQL, and SQLite databases. Please ensure your database is one of these supported types',
		);
	}
}

// Postgres-----------------------------------------------------------------------------------------------------------
const resetPostgres = async (
	db: PgDatabase<any, any, any, any>,
	schema: { [key: string]: PgTable },
) => {
	const tablesToTruncate = Object.entries(schema).map(([_, table]) => {
		const config = getPgTableConfig(table);
		config.schema = config.schema === undefined ? 'public' : config.schema;

		return `${config.schema}.${config.name}`;
	});

	await db.execute(sql.raw(`truncate ${tablesToTruncate.join(',')} cascade;`));
};

const filterPgTables = (schema: {
	[key: string]:
		| PgTable
		| PgSchema
		| MySqlTable
		| MySqlSchema
		| SQLiteTable
		| any;
}) => {
	const pgSchema = Object.fromEntries(
		Object.entries(schema).filter((keyValue): keyValue is [string, PgTable] => is(keyValue[1], PgTable)),
	);

	return { pgSchema };
};

const seedPostgres = async (
	db: PgDatabase<any, any, any, any>,
	schema: { [key: string]: PgTable },
	options: { count?: number; seed?: number } = {},
	refinements?: RefinementsType,
) => {
	const { tables, relations } = getPostgresInfo(schema);
	const generatedTablesGenerators = seedService.generatePossibleGenerators(
		'postgresql',
		tables,
		relations,
		refinements,
		options,
	);

	await seedService.generateTablesValues(
		relations,
		generatedTablesGenerators,
		db,
		schema,
		options,
	);
};

const getPostgresInfo = (schema: { [key: string]: PgTable }) => {
	let tableConfig: ReturnType<typeof getPgTableConfig>;
	let dbToTsColumnNamesMap: { [key: string]: string };
	const dbToTsTableNamesMap: { [key: string]: string } = Object.fromEntries(
		Object.entries(schema).map(([key, value]) => [getTableName(value), key]),
	);

	const tables: Table[] = [];
	const relations: Relation[] = [];
	const dbToTsColumnNamesMapGlobal: {
		[tableName: string]: { [dbColumnName: string]: string };
	} = {};

	const getDbToTsColumnNamesMap = (table: PgTable) => {
		let dbToTsColumnNamesMap: { [dbColName: string]: string } = {};

		const tableName = getTableName(table);
		if (Object.hasOwn(dbToTsColumnNamesMapGlobal, tableName)) {
			dbToTsColumnNamesMap = dbToTsColumnNamesMapGlobal[tableName]!;
			return dbToTsColumnNamesMap;
		}

		const tableConfig = getPgTableConfig(table);
		for (const [tsCol, col] of Object.entries(tableConfig.columns[0]!.table)) {
			dbToTsColumnNamesMap[col.name] = tsCol;
		}
		dbToTsColumnNamesMapGlobal[tableName] = dbToTsColumnNamesMap;

		return dbToTsColumnNamesMap;
	};

	for (const table of Object.values(schema)) {
		tableConfig = getPgTableConfig(table);

		dbToTsColumnNamesMap = {};
		for (const [tsCol, col] of Object.entries(tableConfig.columns[0]!.table)) {
			dbToTsColumnNamesMap[col.name] = tsCol;
		}

		relations.push(
			...tableConfig.foreignKeys.map((fk) => {
				const table = dbToTsTableNamesMap[tableConfig.name] as string;
				const refTable = dbToTsTableNamesMap[getTableName(fk.reference().foreignTable)] as string;

				const dbToTsColumnNamesMapForRefTable = getDbToTsColumnNamesMap(
					fk.reference().foreignTable,
				);

				return {
					table,
					columns: fk
						.reference()
						.columns.map((col) => dbToTsColumnNamesMap[col.name] as string),
					refTable,
					refColumns: fk
						.reference()
						.foreignColumns.map(
							(fCol) => dbToTsColumnNamesMapForRefTable[fCol.name] as string,
						),
				};
			}),
		);

		tables.push({
			name: dbToTsTableNamesMap[tableConfig.name] as string,
			columns: tableConfig.columns.map((column) => ({
				name: dbToTsColumnNamesMap[column.name] as string,
				columnType: column.columnType.replace('Pg', '').toLowerCase(),
				dataType: column.dataType,
				hasDefault: column.hasDefault,
				default: column.default,
				enumValues: column.enumValues,
				isUnique: column.isUnique,
				notNull: column.notNull,
				generatedIdentityType: column.generatedIdentity?.type,
			})),
			primaryKeys: tableConfig.columns
				.filter((column) => column.primary)
				.map((column) => dbToTsColumnNamesMap[column.name] as string),
		});
	}

	return { tables, relations };
};

// MySql-----------------------------------------------------------------------------------------------------
const resetMySql = async (
	db: MySqlDatabase<any, any, any, any>,
	schema: { [key: string]: MySqlTable },
) => {
	const tablesToTruncate = Object.entries(schema).map(([_tsTableName, table]) => {
		const dbTableName = getTableName(table);
		return dbTableName;
	});

	await db.execute(sql.raw('SET FOREIGN_KEY_CHECKS = 0;'));

	for (const tableName of tablesToTruncate) {
		const sqlQuery = `truncate \`${tableName}\`;`;
		await db.execute(sql.raw(sqlQuery));
	}

	await db.execute(sql.raw('SET FOREIGN_KEY_CHECKS = 1;'));
};

const filterMySqlTables = (schema: {
	[key: string]:
		| PgTable
		| PgSchema
		| MySqlTable
		| MySqlSchema
		| SQLiteTable
		| any;
}) => {
	const mySqlSchema = Object.fromEntries(
		Object.entries(schema).filter(
			(keyValue): keyValue is [string, MySqlTable] => is(keyValue[1], MySqlTable),
		),
	);

	return { mySqlSchema };
};

const seedMySql = async (
	db: MySqlDatabase<any, any, any, any>,
	schema: { [key: string]: MySqlTable },
	options: { count?: number; seed?: number } = {},
	refinements?: RefinementsType,
) => {
	const { tables, relations } = getMySqlInfo(schema);

	const generatedTablesGenerators = seedService.generatePossibleGenerators(
		'mysql',
		tables,
		relations,
		refinements,
		options,
	);

	await seedService.generateTablesValues(
		relations,
		generatedTablesGenerators,
		db,
		schema,
		options,
	);
};

const getMySqlInfo = (schema: { [key: string]: MySqlTable }) => {
	let tableConfig: ReturnType<typeof getMysqlTableConfig>;
	let dbToTsColumnNamesMap: { [key: string]: string };

	const dbToTsTableNamesMap: { [key: string]: string } = Object.fromEntries(
		Object.entries(schema).map(([key, value]) => [getTableName(value), key]),
	);

	const tables: Table[] = [];
	const relations: Relation[] = [];
	const dbToTsColumnNamesMapGlobal: {
		[tableName: string]: { [dbColumnName: string]: string };
	} = {};

	const getDbToTsColumnNamesMap = (table: MySqlTable) => {
		let dbToTsColumnNamesMap: { [dbColName: string]: string } = {};

		const tableName = getTableName(table);
		if (Object.hasOwn(dbToTsColumnNamesMapGlobal, tableName)) {
			dbToTsColumnNamesMap = dbToTsColumnNamesMapGlobal[tableName]!;
			return dbToTsColumnNamesMap;
		}

		const tableConfig = getMysqlTableConfig(table);
		for (const [tsCol, col] of Object.entries(tableConfig.columns[0]!.table)) {
			dbToTsColumnNamesMap[col.name] = tsCol;
		}
		dbToTsColumnNamesMapGlobal[tableName] = dbToTsColumnNamesMap;

		return dbToTsColumnNamesMap;
	};

	for (const table of Object.values(schema)) {
		tableConfig = getMysqlTableConfig(table);

		dbToTsColumnNamesMap = {};
		for (const [tsCol, col] of Object.entries(tableConfig.columns[0]!.table)) {
			dbToTsColumnNamesMap[col.name] = tsCol;
		}

		relations.push(
			...tableConfig.foreignKeys.map((fk) => {
				const table = dbToTsTableNamesMap[tableConfig.name] as string;
				const refTable = dbToTsTableNamesMap[getTableName(fk.reference().foreignTable)] as string;
				const dbToTsColumnNamesMapForRefTable = getDbToTsColumnNamesMap(
					fk.reference().foreignTable,
				);

				return {
					table,
					columns: fk
						.reference()
						.columns.map((col) => dbToTsColumnNamesMap[col.name] as string),
					refTable,
					refColumns: fk
						.reference()
						.foreignColumns.map(
							(fCol) => dbToTsColumnNamesMapForRefTable[fCol.name] as string,
						),
				};
			}),
		);

		tables.push({
			name: dbToTsTableNamesMap[tableConfig.name] as string,
			columns: tableConfig.columns.map((column) => ({
				name: dbToTsColumnNamesMap[column.name] as string,
				columnType: column.columnType.replace('MySql', '').toLowerCase(),
				dataType: column.dataType,
				hasDefault: column.hasDefault,
				default: column.default,
				enumValues: column.enumValues,
				isUnique: column.isUnique,
				notNull: column.notNull,
			})),
			primaryKeys: tableConfig.columns
				.filter((column) => column.primary)
				.map((column) => dbToTsColumnNamesMap[column.name] as string),
		});
	}

	return { tables, relations };
};

// Sqlite------------------------------------------------------------------------------------------------------------------------
const resetSqlite = async (
	db: BaseSQLiteDatabase<any, any, any, any>,
	schema: { [key: string]: SQLiteTable },
) => {
	const tablesToTruncate = Object.entries(schema).map(([_tsTableName, table]) => {
		const dbTableName = getTableName(table);
		return dbTableName;
	});

	await db.run(sql.raw('PRAGMA foreign_keys = OFF'));

	for (const tableName of tablesToTruncate) {
		const sqlQuery = `delete from \`${tableName}\`;`;
		await db.run(sql.raw(sqlQuery));
	}

	await db.run(sql.raw('PRAGMA foreign_keys = ON'));
};

const filterSqliteTables = (schema: {
	[key: string]:
		| PgTable
		| PgSchema
		| MySqlTable
		| MySqlSchema
		| SQLiteTable
		| any;
}) => {
	const sqliteSchema = Object.fromEntries(
		Object.entries(schema).filter(
			(keyValue): keyValue is [string, SQLiteTable] => is(keyValue[1], SQLiteTable),
		),
	);

	return { sqliteSchema };
};

const seedSqlite = async (
	db: BaseSQLiteDatabase<any, any, any, any>,
	schema: { [key: string]: SQLiteTable },
	options: { count?: number; seed?: number } = {},
	refinements?: RefinementsType,
) => {
	const { tables, relations } = getSqliteInfo(schema);

	const generatedTablesGenerators = seedService.generatePossibleGenerators(
		'sqlite',
		tables,
		relations,
		refinements,
		options,
	);

	await seedService.generateTablesValues(
		relations,
		generatedTablesGenerators,
		db,
		schema,
		options,
	);
};

const getSqliteInfo = (schema: { [key: string]: SQLiteTable }) => {
	let tableConfig: ReturnType<typeof getSqliteTableConfig>;
	let dbToTsColumnNamesMap: { [key: string]: string };
	const dbToTsTableNamesMap: { [key: string]: string } = Object.fromEntries(
		Object.entries(schema).map(([key, value]) => [getTableName(value), key]),
	);

	const tables: Table[] = [];
	const relations: Relation[] = [];
	const dbToTsColumnNamesMapGlobal: {
		[tableName: string]: { [dbColumnName: string]: string };
	} = {};

	const getDbToTsColumnNamesMap = (table: SQLiteTable) => {
		let dbToTsColumnNamesMap: { [dbColName: string]: string } = {};

		const tableName = getTableName(table);
		if (Object.hasOwn(dbToTsColumnNamesMapGlobal, tableName)) {
			dbToTsColumnNamesMap = dbToTsColumnNamesMapGlobal[tableName]!;
			return dbToTsColumnNamesMap;
		}

		const tableConfig = getSqliteTableConfig(table);
		for (const [tsCol, col] of Object.entries(tableConfig.columns[0]!.table)) {
			dbToTsColumnNamesMap[col.name] = tsCol;
		}
		dbToTsColumnNamesMapGlobal[tableName] = dbToTsColumnNamesMap;

		return dbToTsColumnNamesMap;
	};

	for (const table of Object.values(schema)) {
		tableConfig = getSqliteTableConfig(table);

		dbToTsColumnNamesMap = {};
		for (const [tsCol, col] of Object.entries(tableConfig.columns[0]!.table)) {
			dbToTsColumnNamesMap[col.name] = tsCol;
		}

		relations.push(
			...tableConfig.foreignKeys.map((fk) => {
				const table = dbToTsTableNamesMap[tableConfig.name] as string;
				const refTable = dbToTsTableNamesMap[getTableName(fk.reference().foreignTable)] as string;
				const dbToTsColumnNamesMapForRefTable = getDbToTsColumnNamesMap(
					fk.reference().foreignTable,
				);

				return {
					table,
					columns: fk
						.reference()
						.columns.map((col) => dbToTsColumnNamesMap[col.name] as string),
					refTable,
					refColumns: fk
						.reference()
						.foreignColumns.map(
							(fCol) => dbToTsColumnNamesMapForRefTable[fCol.name] as string,
						),
				};
			}),
		);

		tables.push({
			name: dbToTsTableNamesMap[tableConfig.name] as string,
			columns: tableConfig.columns.map((column) => ({
				name: dbToTsColumnNamesMap[column.name] as string,
				columnType: column.columnType.replace('SQLite', '').toLowerCase(),
				dataType: column.dataType,
				hasDefault: column.hasDefault,
				default: column.default,
				enumValues: column.enumValues,
				isUnique: column.isUnique,
				notNull: column.notNull,
			})),
			primaryKeys: tableConfig.columns
				.filter((column) => column.primary)
				.map((column) => dbToTsColumnNamesMap[column.name] as string),
		});
	}

	return { tables, relations };
};

export { default as firstNames } from './datasets/firstNames.ts';
export { default as lastNames } from './datasets/lastNames.ts';
