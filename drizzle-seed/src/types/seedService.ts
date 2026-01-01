import type { CockroachDatabase, CockroachTable } from 'drizzle-orm/cockroach-core';
import type { MsSqlDatabase, MsSqlTable } from 'drizzle-orm/mssql-core';
import type { MySqlDatabase, MySqlTable } from 'drizzle-orm/mysql-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async';
import type { SingleStoreDatabase, SingleStoreTable } from 'drizzle-orm/singlestore-core';
import type { BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { AbstractGenerator } from '../generators/Generators.ts';
import type { Prettify } from './tables.ts';

export type GeneratedValueType = number | bigint | string | Buffer | boolean | undefined;

export type DbType =
	| PgAsyncDatabase<any, any, any>
	| MySqlDatabase<any, any, any, any>
	| BaseSQLiteDatabase<any, any, any, any>
	| MsSqlDatabase<any, any, any, any>
	| CockroachDatabase<any, any, any>
	| SingleStoreDatabase<any, any, any, any>;

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
