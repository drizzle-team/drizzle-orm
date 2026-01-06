/* eslint-disable drizzle-internal/require-entity-kind */
import { is } from 'drizzle-orm';
import type { Relations } from 'drizzle-orm/_relations';

import type { MySqlColumn, MySqlSchema, MySqlTable } from 'drizzle-orm/mysql-core';
import { MySqlDatabase } from 'drizzle-orm/mysql-core';

import type { PgColumn, PgSchema, PgTable } from 'drizzle-orm/pg-core';
import { PgAsyncDatabase } from 'drizzle-orm/pg-core/async';

import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { MsSqlColumn, MsSqlSchema, MsSqlTable } from 'drizzle-orm/mssql-core';
import { MsSqlDatabase } from 'drizzle-orm/mssql-core';

import type { CockroachColumn, CockroachSchema, CockroachTable } from 'drizzle-orm/cockroach-core';
import { CockroachDatabase } from 'drizzle-orm/cockroach-core';

import type { SingleStoreColumn, SingleStoreSchema, SingleStoreTable } from 'drizzle-orm/singlestore-core';
import { SingleStoreDatabase } from 'drizzle-orm/singlestore-core';

import { filterCockroachSchema, resetCockroach, seedCockroach } from './cockroach-core/index.ts';
import {
	generatorsFuncs,
	generatorsFuncsV2,
	type generatorsFuncsV3,
	type generatorsFuncsV4,
} from './generators/GeneratorFuncs.ts';
import type { AbstractGenerator } from './generators/Generators.ts';
import { filterMsSqlTables, resetMsSql, seedMsSql } from './mssql-core/index.ts';
import { filterMysqlTables, resetMySql, seedMySql } from './mysql-core/index.ts';
import { filterPgSchema, resetPostgres, seedPostgres } from './pg-core/index.ts';
import { SeedService } from './SeedService.ts';
import { filterSingleStoreTables, resetSingleStore, seedSingleStore } from './singlestore-core/index.ts';
import { filterSqliteTables, resetSqlite, seedSqlite } from './sqlite-core/index.ts';
import type { DrizzleStudioObjectType, DrizzleStudioRelationType } from './types/drizzleStudio.ts';
import type { DbType, RefinementsType } from './types/seedService.ts';
import type { Relation, Table } from './types/tables.ts';

type SchemaValuesType =
	| PgTable
	| PgSchema
	| MySqlTable
	| MySqlSchema
	| SQLiteTable
	| MsSqlTable
	| MsSqlSchema
	| CockroachTable
	| CockroachSchema
	| SingleStoreTable
	| SingleStoreSchema
	| Relations
	| any;

export type RefineTypes<SCHEMA, TableT, ColumnT> = SCHEMA extends {
	[key: string]: SchemaValuesType;
} ? {
		// iterates through schema fields. example -> schema: {"tableName": PgTable}
		[
			fieldName in keyof SCHEMA as SCHEMA[fieldName] extends TableT ? fieldName
				: never
		]?: {
			count?: number;
			columns?: {
				// iterates through table fields. example -> table: {"columnName": PgColumn}
				[
					column in keyof SCHEMA[fieldName] as SCHEMA[fieldName][column] extends ColumnT ? column
						: never
				]?: AbstractGenerator<any> | false;
			};
			with?: {
				[
					refTable in keyof SCHEMA as SCHEMA[refTable] extends TableT ? refTable
						: never
				]?:
					| number
					| { weight: number; count: number | number[] }[];
			};
		};
	}
	: {};

export type InferCallbackType<
	DB extends DbType,
	SCHEMA extends {
		[key: string]: SchemaValuesType;
	},
> = DB extends PgAsyncDatabase<any, any> ? RefineTypes<SCHEMA, PgTable, PgColumn>
	: DB extends MySqlDatabase<any, any> ? RefineTypes<SCHEMA, MySqlTable, MySqlColumn>
	: DB extends BaseSQLiteDatabase<any, any> ? RefineTypes<SCHEMA, SQLiteTable, SQLiteColumn>
	: DB extends MsSqlDatabase<any, any> ? RefineTypes<SCHEMA, MsSqlTable, MsSqlColumn>
	: DB extends CockroachDatabase<any, any> ? RefineTypes<SCHEMA, CockroachTable, CockroachColumn>
	: DB extends SingleStoreDatabase<any, any> ? RefineTypes<SCHEMA, SingleStoreTable, SingleStoreColumn>
	: {};

class SeedPromise<
	DB extends DbType,
	SCHEMA extends {
		[key: string]: SchemaValuesType;
	},
	VERSION extends string | undefined,
> implements Promise<void> {
	static readonly entityKind: string = 'SeedPromise';

	[Symbol.toStringTag] = 'SeedPromise';

	constructor(
		private db: DB,
		private schema: SCHEMA,
		private options?: { count?: number; seed?: number; version?: VERSION },
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
		callback: (
			funcs: FunctionsVersioning<VERSION>,
		) => InferCallbackType<DB, SCHEMA>,
	): Promise<void> {
		const refinements = this.options?.version === undefined || this.options.version === '2'
			? callback(generatorsFuncsV2 as FunctionsVersioning<VERSION>) as RefinementsType
			: callback(generatorsFuncs as FunctionsVersioning<VERSION>) as RefinementsType;

		await seedFunc(this.db, this.schema, this.options, refinements);
	}
}

export type FunctionsVersioning<VERSION extends string | undefined = undefined> = VERSION extends `1`
	? typeof generatorsFuncs
	: VERSION extends `2` ? typeof generatorsFuncsV2
	: VERSION extends `3` ? typeof generatorsFuncsV3
	: VERSION extends `4` ? typeof generatorsFuncsV4
	: typeof generatorsFuncsV4;

export function getGeneratorsFunctions() {
	return generatorsFuncs;
}

export async function seedForDrizzleStudio(
	{ sqlDialect, drizzleStudioObject, drizzleStudioRelations, schemasRefinements, options }: {
		sqlDialect: 'postgresql' | 'mysql' | 'sqlite' | 'mssql' | 'cockroach' | 'singlestore';
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
				// TODO: revise later
				typeParams: {},
				default: col.default,
				hasDefault: col.default === undefined ? false : true,
				isUnique: col.isUnique === undefined ? false : col.isUnique,
				notNull: col.notNull,
				primary: col.primaryKey,
			}));
			tables.push(
				{
					name: tableName,
					columns,
					primaryKeys: drizzleStudioColumns.filter((col) => col.primaryKey === true).map((col) => col.name),
					uniqueConstraints: [], // TODO change later
				},
			);
		}

		relations = drizzleStudioRelations.filter((rel) => rel.schema === schemaName && rel.refSchema === schemaName);
		const isCyclicRelations = relations.map(
			(reli) => {
				if (relations.some((relj) => reli.table === relj.refTable && reli.refTable === relj.table)) {
					return { ...reli, isCyclic: true };
				}
				return { ...reli, isCyclic: false };
			},
		);

		refinements = schemasRefinements !== undefined && schemasRefinements[schemaName] !== undefined
			? schemasRefinements[schemaName]
			: undefined;

		const seedService = new SeedService();

		const generatedTablesGenerators = seedService.generatePossibleGenerators(
			sqlDialect,
			tables,
			isCyclicRelations,
			refinements,
			options,
		);

		const generatedTables = await seedService.generateTablesValues(
			isCyclicRelations,
			generatedTablesGenerators,
			undefined,
			undefined,
			{ ...options, preserveData: true, insertDataInDb: false },
		) as {
			tableName: string;
			rows: {
				[columnName: string]: string | number | boolean | undefined;
			}[];
		}[];

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
 * // seeding using refine
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
 * // seeding while ignoring column
 * await seed(db, schema).refine((funcs) => ({
 *   users: {
 *     count: 5,
 *     columns: {
 *       name: funcs.fullName(),
 *       photo: false, // the photo column will not be seeded, allowing the database to use its default value.
 *     },
 *   },
 * }));
 *
 * ```
 */
export function seed<
	DB extends DbType,
	SCHEMA extends {
		[key: string]: SchemaValuesType;
	},
	VERSION extends '4' | '3' | '2' | '1' | undefined,
>(db: DB, schema: SCHEMA, options?: { count?: number; seed?: number; version?: VERSION }) {
	return new SeedPromise<typeof db, typeof schema, VERSION>(db, schema, options);
}

const seedFunc = async (
	db: DbType,
	schema: {
		[key: string]: SchemaValuesType;
	},
	options: { count?: number; seed?: number; version?: string } = {},
	refinements?: RefinementsType,
) => {
	let version: number | undefined;
	if (options?.version !== undefined) {
		version = Number(options?.version);
	}

	if (is(db, PgAsyncDatabase<any, any>)) {
		await seedPostgres(db, schema, { ...options, version }, refinements);
	} else if (is(db, MySqlDatabase<any, any>)) {
		await seedMySql(db, schema, { ...options, version }, refinements);
	} else if (is(db, BaseSQLiteDatabase<any, any>)) {
		await seedSqlite(db, schema, { ...options, version }, refinements);
	} else if (is(db, MsSqlDatabase<any, any>)) {
		await seedMsSql(db, schema, { ...options, version }, refinements);
	} else if (is(db, CockroachDatabase<any, any>)) {
		await seedCockroach(db, schema, { ...options, version }, refinements);
	} else if (is(db, SingleStoreDatabase<any, any>)) {
		await seedSingleStore(db, schema, { ...options, version }, refinements);
	} else {
		throw new Error(
			'The drizzle-seed package currently supports only PostgreSQL, MySQL, SQLite, Ms Sql, CockroachDB and SingleStore databases. Please ensure your database is one of these supported types',
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
 *
 * // Alternatively, you can provide an object containing your tables
 * // as the `schema` parameter when calling `reset`.
 * await reset(db, { users });
 * ```
 */
export async function reset<
	DB extends DbType,
	SCHEMA extends {
		[key: string]: SchemaValuesType;
	},
>(db: DB, schema: SCHEMA) {
	if (is(db, PgAsyncDatabase<any, any>)) {
		const { pgTables } = filterPgSchema(schema);

		if (Object.entries(pgTables).length > 0) {
			await resetPostgres(db, pgTables);
		}
	} else if (is(db, MySqlDatabase<any, any>)) {
		const { mysqlTables } = filterMysqlTables(schema);

		if (Object.entries(mysqlTables).length > 0) {
			await resetMySql(db, mysqlTables);
		}
	} else if (is(db, BaseSQLiteDatabase<any, any>)) {
		const { sqliteTables } = filterSqliteTables(schema);

		if (Object.entries(sqliteTables).length > 0) {
			await resetSqlite(db, sqliteTables);
		}
	} else if (is(db, MsSqlDatabase<any, any>)) {
		const { mssqlTables } = filterMsSqlTables(schema);

		if (Object.entries(mssqlTables).length > 0) {
			await resetMsSql(db, mssqlTables);
		}
	} else if (is(db, CockroachDatabase<any, any>)) {
		const { cockroachTables } = filterCockroachSchema(schema);

		if (Object.entries(cockroachTables).length > 0) {
			await resetCockroach(db, cockroachTables);
		}
	} else if (is(db, SingleStoreDatabase<any, any>)) {
		const { singleStoreTables } = filterSingleStoreTables(schema);

		if (Object.entries(singleStoreTables).length > 0) {
			await resetSingleStore(db, singleStoreTables);
		}
	} else {
		throw new Error(
			'The drizzle-seed package currently supports only PostgreSQL, MySQL, SQLite, Ms Sql, CockroachDB and SingleStore databases. Please ensure your database is one of these supported types',
		);
	}
}

export { default as cities } from './datasets/cityNames.ts';
export { default as countries } from './datasets/countries.ts';
export { default as firstNames } from './datasets/firstNames.ts';
export { default as lastNames } from './datasets/lastNames.ts';
export { SeedService } from './SeedService.ts';
