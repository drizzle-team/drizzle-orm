import { InferColumnTable } from 'drizzle-orm';
import { TableName } from 'drizzle-orm/branded-types';
import { SQL } from 'drizzle-orm/sql';
import { GetTableName } from 'drizzle-orm/utils';
import { AnyMySqlColumn } from './columns';
import { AnyMySqlTable } from './table';

interface IndexConfig<TTableName extends TableName, TUnique extends boolean> {
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

type GetIndexConfigUnique<TIndexConfig extends IndexConfig<any, any>> = TIndexConfig extends
	IndexConfig<any, infer TUnique> ? TUnique : never;

export class IndexBuilder<
	TTableName extends TableName,
	TUnique extends boolean,
> {
	protected typeKeeper!: {
		tableName: TTableName;
		unique: TUnique;
	};

	protected brand!: 'PgIndexBuilder';

	constructor(
		public readonly name: string,
		public readonly columns: AnyMySqlColumn<TTableName>[],
		public readonly config: IndexConfig<TTableName, TUnique> = {},
	) {}

	build(table: AnyMySqlTable<TTableName>): Index<TTableName, TUnique> {
		return new Index(this.name, table, this.columns, this);
	}
}

export type AnyIndexBuilder<TTableName extends TableName = TableName> = IndexBuilder<TTableName, any>;

export class Index<TTableName extends TableName, TUnique extends boolean> {
	protected typeKeeper!: {
		tableName: TTableName;
		unique: TUnique;
	};

	readonly config: IndexConfig<TTableName, TUnique>;

	constructor(
		public readonly name: string,
		public readonly table: AnyMySqlTable<TTableName>,
		public readonly columns: AnyMySqlColumn<TTableName>[],
		builder: IndexBuilder<TTableName, TUnique>,
	) {
		this.config = builder.config;
	}

	// TODO: move to .onConflict()
	// set(values: PgUpdateSet<TTable>): { constraintName: string; set: PgUpdateSet<TTable> } {
	// 	return {
	// 		constraintName: this.name,
	// 		set: values,
	// 	};
	// }
}

export type AnyIndex = Index<any, any>;

export type BuildIndex<T extends AnyIndexBuilder> = T extends IndexBuilder<infer TTableName, infer TUnique>
	? Index<TTableName, TUnique>
	: never;

type GetColumnsTable<TColumns> = TColumns extends AnyMySqlColumn ? InferColumnTable<TColumns>
	: TColumns extends AnyMySqlColumn[] ? InferColumnTable<TColumns[number]>
	: never;

export function index<
	TColumns extends
		| AnyMySqlColumn
		| [AnyMySqlColumn, ...AnyMySqlColumn[]],
	TConfig extends IndexConfig<GetColumnsTable<TColumns>, boolean> = IndexConfig<GetColumnsTable<TColumns>, false>,
>(
	name: string,
	columns: TColumns,
	config?: TConfig,
): IndexBuilder<GetColumnsTable<TColumns>, GetIndexConfigUnique<TConfig>>;
export function index(
	name: string,
	columns: AnyMySqlColumn | AnyMySqlColumn[],
	config?: IndexConfig<any, any>,
) {
	return new IndexBuilder(name, Array.isArray(columns) ? columns : [columns], config);
}

export function uniqueIndex() {}
