import { SQL } from 'drizzle-orm/sql';

import { AnyPgColumn } from './columns';
import { PgUpdateSetSource } from './queries/update';
import { AnyPgTable, PgTable } from './table';

interface IndexConfig<TUnique extends boolean> {
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

type GetIndexConfigUnique<TIndexConfig extends IndexConfig<any>> = TIndexConfig extends IndexConfig<infer TUnique>
	? TUnique
	: never;

export class IndexBuilder<TTableName extends string, TUnique extends boolean> {
	protected typeKeeper!: {
		tableName: TTableName;
		unique: TUnique;
	};

	protected brand!: 'PgIndexBuilder';

	constructor(
		public readonly name: string,
		public readonly columns: AnyPgColumn<{ tableName: TTableName }>[],
		public readonly config: IndexConfig<TUnique> = {},
	) {}

	build<TTableColumns extends Record<string, AnyPgColumn<{ tableName: TTableName }>>>(
		table: AnyPgTable<{ name: TTableName; columns: TTableColumns }>,
	): Index<TTableName, TTableColumns, TUnique> {
		return new Index(this.name, table, table[PgTable.Symbol.Columns], this.columns, this);
	}
}

export type AnyIndexBuilder<TTableName extends string = string> = IndexBuilder<
	TTableName,
	any
>;

export class Index<
	TTableName extends string,
	TTableColumns extends Record<string, AnyPgColumn<{ tableName: TTableName }>>,
	TUnique extends boolean,
> {
	protected typeKeeper!: {
		unique: TUnique;
	};

	readonly config: IndexConfig<TUnique>;

	constructor(
		public readonly name: string,
		public readonly table: AnyPgTable<{ name: TTableName }>,
		public readonly tableColumns: TTableColumns,
		public readonly columns: AnyPgColumn<{ tableName: TTableName }>[],
		builder: IndexBuilder<TTableName, TUnique>,
	) {
		this.config = builder.config;
	}

	// ON CONFLICT ... SET
	set(values: PgUpdateSetSource<AnyPgTable<{ name: TTableName; columns: TTableColumns }>>): {
		constraintName: string;
		set: PgUpdateSetSource<AnyPgTable<{ name: TTableName; columns: TTableColumns }>>;
	} {
		return {
			constraintName: this.name,
			set: values,
		};
	}
}

export type AnyIndex = Index<any, any, any>;

export type BuildIndex<
	T extends AnyIndexBuilder,
	TTableColumns extends Record<string, AnyPgColumn>,
> = T extends IndexBuilder<infer TTableName, infer TUnique>
	? TTableColumns extends Record<string, AnyPgColumn<{ tableName: TTableName }>>
		? Index<TTableName, TTableColumns, TUnique>
	: never
	: never;

export type GetColumnsTableName<TColumns> = TColumns extends
	AnyPgColumn<{ tableName: infer TTableName extends string }> | AnyPgColumn<
		{ tableName: infer TTableName extends string }
	>[] ? TTableName
	: never;

export function index<
	TColumns extends AnyPgColumn | [AnyPgColumn, ...AnyPgColumn[]],
	TConfig extends IndexConfig<boolean> = IndexConfig<false>,
>(
	name: string,
	columns: TColumns,
	config?: TConfig,
): IndexBuilder<GetColumnsTableName<TColumns>, GetIndexConfigUnique<TConfig>>;
export function index(
	name: string,
	columns: AnyPgColumn | AnyPgColumn[],
	config?: IndexConfig<any>,
) {
	return new IndexBuilder(name, Array.isArray(columns) ? columns : [columns], config);
}

export function uniqueIndex() {}
