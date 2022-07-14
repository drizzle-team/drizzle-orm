import { InferColumnTable } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';

import { PgColumn, AnyPgColumn } from './columns';
import { AnyPgTable } from './table';

interface IndexConfig<TUnique extends boolean, TTableName extends string> {
	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique?: TUnique;

	/**
	 * If true, the index will be created as `create index concurrently` instead of `create index`.
	 */
	concurrently?: boolean;

	/**
	 * Index name.
	 */
	name?: string;

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

export class IndexBuilder<TTableName extends string, TUnique extends boolean> {
	columns: PgColumn<TTableName>[];
	unique: TUnique;
	name: string | undefined;
	protected brand!: 'PgIndexBuilder';

	constructor(columns: PgColumn<TTableName>[], config: IndexConfig<TUnique, TTableName>) {
		this.columns = columns;
		this.unique = config.unique ?? (false as TUnique);
		this.name = config.name;
	}

	build(table: AnyPgTable<TTableName>): Index<TTableName> {
		return new Index(table, this.columns, this);
	}
}

export type AnyIndexBuilder<TTableName extends string = string> = IndexBuilder<TTableName, boolean>;

export class Index<TTableName extends string, TUnique extends boolean = boolean> {
	table: AnyPgTable<TTableName>;
	columns: PgColumn<TTableName>[];
	unique: boolean;
	name: string | undefined;

	constructor(
		table: AnyPgTable<TTableName>,
		columns: PgColumn<TTableName>[],
		builder: IndexBuilder<TTableName, TUnique>,
	) {
		this.table = table;
		this.columns = columns;
		this.unique = builder.unique;
		this.name = builder.name;
	}
}

export type AnyIndex = Index<string>;

type InferColumnsTable<TColumns> = TColumns extends PgColumn<any>
	? InferColumnTable<TColumns>
	: TColumns extends AnyPgColumn[]
	? InferColumnTable<TColumns[number]>
	: never;

export function index<TColumns extends AnyPgColumn | [AnyPgColumn, ...AnyPgColumn[]]>(
	columns: TColumns,
	config: IndexConfig<true, InferColumnsTable<TColumns>>,
): IndexBuilder<InferColumnsTable<TColumns>, true>;
export function index<TColumns extends AnyPgColumn | [AnyPgColumn, ...AnyPgColumn[]]>(
	columns: TColumns,
): IndexBuilder<InferColumnsTable<TColumns>, false>;
export function index<TColumns extends AnyPgColumn | [AnyPgColumn, ...AnyPgColumn[]]>(
	columns: TColumns,
	config: IndexConfig<boolean, InferColumnsTable<TColumns>>,
): IndexBuilder<InferColumnsTable<TColumns>, boolean>;
export function index<TColumns extends AnyPgColumn | [AnyPgColumn, ...AnyPgColumn[]]>(
	columns: TColumns,
	config: IndexConfig<boolean, InferColumnsTable<TColumns>> = {},
) {
	return new IndexBuilder<InferColumnsTable<TColumns>, boolean>(
		(columns instanceof PgColumn ? [columns] : columns) as PgColumn<
			InferColumnsTable<TColumns>
		>[],
		config,
	);
}

export function uniqueIndex() {}
