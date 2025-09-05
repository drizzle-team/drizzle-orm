/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AnyColumn } from 'drizzle-orm';
import type { CockroachTable, ForeignKey as CockroachFK } from 'drizzle-orm/cockroach-core';
import type { ForeignKey as MsSqlFK, MsSqlTable } from 'drizzle-orm/mssql-core';
import type { ForeignKey as MySqlFK, MySqlTable } from 'drizzle-orm/mysql-core';
import type { ForeignKey as PgFK, PgTable } from 'drizzle-orm/pg-core';
import type { SingleStoreTable } from 'drizzle-orm/singlestore-core';
import type { ForeignKey as SQLiteFK, SQLiteTable } from 'drizzle-orm/sqlite-core';

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
	primaryKeys: string[];
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
export type TableConfigT = { name: string; schema?: string; columns: AnyColumn[]; foreignKeys?: DrizzleForeignKey[] };
