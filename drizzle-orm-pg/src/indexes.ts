import { SQL } from 'drizzle-orm/sql';

import { AnyPgColumn } from './columns';
import { PgUpdateSetSource } from './queries/update';
import { AnyPgTable, PgTable } from './table';

interface IndexConfig {
	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique?: boolean;

	/**
	 * If true, the index will be created as `create index concurrently` instead of `create index`.
	 */
	concurrently?: boolean;

	/**
	 * If true, the index will be created as `create index ... on only <table>` instead of `create index ... on <table>`.
	 */
	only?: boolean;

	/**
	 * If set, the index will be created as `create index ... using <method>`.
	 */
	using?: SQL;

	/**
	 * If set, the index will be created as `create index ... asc | desc`.
	 */
	order?: 'asc' | 'desc';

	/**
	 * If set, adds `nulls first` or `nulls last` to the index.
	 */
	nulls?: 'first' | 'last';

	/**
	 * Condition for partial index.
	 */
	where?: SQL;
}

export type IndexColumn = AnyPgColumn | SQL;

export class IndexBuilder {
	declare protected $brand: 'PgIndexBuilder';

	constructor(
		readonly name: string,
		readonly columns: AnyPgColumn[],
		readonly config: IndexConfig = {},
	) {}

	/** @internal */
	build(table: AnyPgTable): Index {
		return new Index(this.name, table, this.columns, this);
	}
}

export class Index {
	declare protected $brand: 'PgIndex';

	readonly config: IndexConfig;

	constructor(
		readonly name: string,
		readonly table: AnyPgTable,
		readonly columns: AnyPgColumn[],
		builder: IndexBuilder,
	) {
		this.config = builder.config;
	}
}

export type GetColumnsTableName<TColumns> = TColumns extends
	AnyPgColumn<{ tableName: infer TTableName extends string }> | AnyPgColumn<
		{ tableName: infer TTableName extends string }
	>[] ? TTableName
	: never;

export function index(
	name: string,
	columns: AnyPgColumn | [AnyPgColumn, ...AnyPgColumn[]],
	config?: IndexConfig,
): IndexBuilder;
export function index(name: string, columns: AnyPgColumn | AnyPgColumn[], config?: IndexConfig) {
	return new IndexBuilder(name, Array.isArray(columns) ? columns : [columns], config);
}

export function uniqueIndex() {}
