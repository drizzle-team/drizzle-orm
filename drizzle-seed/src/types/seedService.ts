import type { CockroachDatabase, CockroachTable } from 'drizzle-orm/cockroach-core';
import type { MsSqlDatabase, MsSqlTable } from 'drizzle-orm/mssql-core';
import type { MySqlAsyncDatabase, MySqlTable } from 'drizzle-orm/mysql-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async';
import type { SingleStoreDatabase, SingleStoreTable } from 'drizzle-orm/singlestore-core';
import type { SQLiteAsyncDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { AbstractGenerator } from '../generators/Generators.ts';
import type { Prettify } from './tables.ts';

export type GeneratedValueType = number | bigint | string | Buffer | boolean | undefined | null;

export type GeneratedRow = { [columnName: string]: GeneratedValueType };

export type GeneratedTablesValues = {
	[tableName: string]: GeneratedRow[];
};

/**
 * One write a seed is made of. Generating these is the same work whatever is done with them afterwards, so the seeding
 * pipeline produces them once and the caller decides whether to run them, keep their rows or render them as sql.
 */
export type SeedOperation =
	| {
		type: 'insert';
		tableName: string;
		rows: GeneratedRow[];
		/** identity columns are being written explicitly, so the database has to be told to allow it */
		override: boolean;
	}
	| {
		type: 'update';
		tableName: string;
		values: GeneratedRow;
		whereColumn: string;
		whereValue: GeneratedValueType;
	}
	| {
		type: 'sequence';
		tableName: string;
		columnName: string;
		value: number | bigint;
	};

export type ConnectionType = 'postgresql' | 'mysql' | 'sqlite' | 'mssql' | 'cockroach' | 'singlestore';

export type DbType =
	| PgAsyncDatabase<any, any>
	| MySqlAsyncDatabase<any, any>
	| SQLiteAsyncDatabase<any, any, any>
	| MsSqlDatabase<any, any, any>
	| CockroachDatabase<any, any>
	| SingleStoreDatabase<any, any, any>;

export type TableType = PgTable | MySqlTable | SQLiteTable | MsSqlTable | CockroachTable | SingleStoreTable;

export type TableGeneratorsType = {
	[columnName: string]: Prettify<
		{
			hasSelfRelation?: boolean | undefined;
			hasRelation?: boolean | undefined;
			pRNGSeed: number;
		} & GeneratePossibleGeneratorsColumnType
	>;
};

export type GeneratePossibleGeneratorsColumnType = {
	columnName: string;
	generator: AbstractGenerator<any> | undefined;
	isUnique: boolean;
	notNull: boolean;
	primary: boolean;
	generatedIdentityType?: 'always' | 'byDefault' | undefined;
	identity?: boolean;
	wasRefined: boolean;
	wasDefinedBefore: boolean;
	isCyclic: boolean;
};

export type GeneratePossibleGeneratorsTableType = Prettify<{
	tableName: string;
	count?: number;
	withCount?: number;
	withFromTable: {
		[withFromTableName: string]: {
			repeatedValuesCount:
				| number
				| { weight: number; count: number | number[] }[];
			weightedCountSeed?: number;
		};
	};
	// repeatedValuesCount?: number,
	// withFromTableName?: string,
	columnsPossibleGenerators: GeneratePossibleGeneratorsColumnType[];
}>;

export type RefinementsType = Prettify<{
	[tableName: string]: {
		count?: number;
		columns: { [columnName: string]: AbstractGenerator<{}> | false };
		with?: { [tableName: string]: number | { weight: number; count: number | number[] }[] };
	};
}>;
