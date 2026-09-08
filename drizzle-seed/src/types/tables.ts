/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AnyColumn } from 'drizzle-orm';
import type {
	CockroachTable,
	ForeignKey as CockroachFK,
	UniqueConstraint as CockroachUniCon,
} from 'drizzle-orm/cockroach-core';
import type { ForeignKey as MsSqlFK, MsSqlTable, UniqueConstraint as MsSqlUniCon } from 'drizzle-orm/mssql-core';
import type { ForeignKey as MySqlFK, MySqlTable, UniqueConstraint as MySqlUniCon } from 'drizzle-orm/mysql-core';
import type { ForeignKey as PgFK, PgTable, UniqueConstraint as PgUniCon } from 'drizzle-orm/pg-core';
import type { SingleStoreTable, UniqueConstraint as SingleStoreUniCon } from 'drizzle-orm/singlestore-core';
import type { ForeignKey as SQLiteFK, SQLiteTable, UniqueConstraint as SQLiteUniCon } from 'drizzle-orm/sqlite-core';

export type Column = {
	name: string;
	dataType: string;
	columnType: string;
	typeParams: {
		precision?: number;
		scale?: number;
		length?: number;
		dimensions?: number;
		vectorValueType?: 'I8' | 'I16' | 'I32' | 'I64' | 'F32' | 'F64';
	};
	size?: number;
	default?: any;
	hasDefault: boolean;
	enumValues?: string[];
	isUnique: boolean;
	notNull: boolean;
	primary: boolean;
	generatedIdentityType?: 'always' | 'byDefault' | undefined;
	identity?: boolean;
	baseColumn?: Omit<Column, 'generatedIdentityType'>;
};

export type Table = {
	name: string;
	columns: Column[];
	uniqueConstraints: string[][];
	/** columns marked primary one by one, which is all `Column.primary` ever reflects */
	primaryKeys: string[];
	/** column tuples declared primary at table level, which never mark their columns as primary */
	compositePrimaryKeys: string[][];
};

export type Relation = {
	// name: string;
	type?: 'one' | 'many';
	table: string;
	// schema: string;
	columns: string[];
	refTable: string;
	// refSchema: string;
	refColumns: string[];
};

export type RelationWithReferences = Relation & { isCyclic?: boolean; refTableRels: RelationWithReferences[] };

export type Prettify<T> =
	& {
		[K in keyof T]: T[K];
	}
	& {};

export type DrizzleTable = PgTable | MySqlTable | SQLiteTable | CockroachTable | MsSqlTable | SingleStoreTable;
export type DrizzleForeignKey = PgFK | MySqlFK | SQLiteFK | CockroachFK | MsSqlFK;
export type DrizzleUniqueConstraint =
	| PgUniCon
	| MySqlUniCon
	| SQLiteUniCon
	| CockroachUniCon
	| MsSqlUniCon
	| SingleStoreUniCon;

/**
 * A relational config as built by `defineRelations`. Declared structurally rather than as drizzle's `AnyRelations` so
 * that a config built over a schema whose types TypeScript had to widen still fits - a single `references(() => ...)`
 * back at its own table is enough to widen one - which is exactly what `drizzle({ relations })` accepts too.
 */
export type SeedRelations = {
	[tsTableName: string]: { table: any; name: string; relations: any } | undefined;
};

export type DrizzlePrimaryKey = {
	readonly columns: AnyColumn[];
	readonly name?: string;
};

export type TableConfigT = {
	name: string;
	schema?: string;
	columns: AnyColumn[];
	uniqueConstraints: DrizzleUniqueConstraint[];
	foreignKeys?: DrizzleForeignKey[];
	primaryKeys?: DrizzlePrimaryKey[];
};
