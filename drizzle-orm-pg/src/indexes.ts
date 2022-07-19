import { InferColumnTable } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { TableName, tableName } from 'drizzle-orm/utils';

import { AnyPgColumn, PgColumn } from './columns';
import { PgDriverParam } from './connection';
import { PgUpdateSet } from './queries/update';
import { AnyPgTable, TableColumns } from './table';

interface IndexConfig<TTableName extends string, TUnique extends boolean> {
	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique?: TUnique;

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
	using?: SQL<TTableName>;

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
	where?: SQL<TTableName>;
}

export class IndexBuilder<
	TTable extends AnyPgTable,
	TUnique extends boolean,
> {
	protected typeKeeper!: {
		table: TTable;
		unique: TUnique;
	};

	protected brand!: 'PgIndexBuilder';

	constructor(
		public readonly name: string,
		public readonly columns: AnyPgColumn<TableName<TTable>>[],
		public readonly config: IndexConfig<TableName<TTable>, TUnique> = {},
	) {}

	build(table: TTable): Index<TTable, TUnique> {
		return new Index(this.name, table, this.columns, this);
	}
}

export type AnyIndexBuilder<
	TTableName extends string = string,
	TTable extends AnyPgTable<TTableName> = AnyPgTable<TTableName>,
> = IndexBuilder<TTable, any>;

export class Index<TTable extends AnyPgTable, TUnique extends boolean> {
	protected typeKeeper!: {
		table: TTable;
		unique: TUnique;
	};

	readonly config: IndexConfig<TableName<TTable>, TUnique>;

	constructor(
		public readonly name: string,
		public readonly table: TTable,
		public readonly columns: AnyPgColumn<TableName<TTable>>[],
		builder: IndexBuilder<TTable, TUnique>,
	) {
		this.config = builder.config;
	}

	set(values: PgUpdateSet<TTable>): { constraintName: string; set: PgUpdateSet<TTable> } {
		return {
			constraintName: this.name,
			set: values,
		};
	}
}

export type AnyIndex = Index<any, any>;

export type BuildIndex<T extends AnyIndexBuilder> = T extends IndexBuilder<
	infer TTable,
	infer TUnique
> ? Index<TTable, TUnique>
	: never;

type InferColumnsTable<TColumns> = TColumns extends AnyPgColumn ? InferColumnTable<TColumns>
	: TColumns extends AnyPgColumn[] ? InferColumnTable<TColumns[number]>
	: never;

export function index<
	TTable extends AnyPgTable,
	TColumns extends
		| TableColumns<TTable>[string]
		| [TableColumns<TTable>[string], ...TableColumns<TTable>[string][]],
>(name: string, columns: TColumns): IndexBuilder<TTable, false>;
export function index<
	TTable extends AnyPgTable,
	TColumns extends
		| TableColumns<TTable>[string]
		| [TableColumns<TTable>[string], ...TableColumns<TTable>[string][]],
>(
	name: string,
	columns: TColumns,
	config: IndexConfig<InferColumnsTable<TColumns>, true>,
): IndexBuilder<TTable, true>;
export function index<
	TTable extends AnyPgTable,
	TColumns extends
		| TableColumns<TTable>[string]
		| [TableColumns<TTable>[string], ...TableColumns<TTable>[string][]],
>(
	name: string,
	columns: TColumns,
	config: IndexConfig<InferColumnsTable<TColumns>, false>,
): IndexBuilder<TTable, false>;
export function index(
	name: string,
	columns: AnyPgColumn | AnyPgColumn[],
	config?: IndexConfig<any, any>,
) {
	return new IndexBuilder(name, Array.isArray(columns) ? columns : [columns], config);
}

export function uniqueIndex() {}
