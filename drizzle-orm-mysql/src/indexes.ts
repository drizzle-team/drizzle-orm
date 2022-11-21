import { InferColumnTable } from 'drizzle-orm';
import { TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlColumn } from './columns';
import { MySQL } from './sql';
import { AnyMySqlTable } from './table';

interface IndexConfig<TTableName extends string> {
	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique?: boolean;

	/**
	 * If set, the index will be created as `create index ... using { 'btree' | 'hash' }`.
	 */
	using?: 'btree' | 'hash' | MySQL<TTableName | string>;

	/**
	 * If set, the index will be created as `create index ... algorythm { 'default' | 'inplace' | 'copy' }`.
	 */
	algorythm?: 'default' | 'inplace' | 'copy' | MySQL<TTableName | string>;

	/**
	 * If set, adds locks to the index creation.
	 */
	lock?: 'default' | 'none' | 'shared' | 'exclusive' | MySQL<TTableName | string>;
}

export class IndexBuilder<TTableName extends string> {
	protected typeKeeper!: {
		tableName: TTableName;
	};

	protected brand!: 'MySqlIndexBuilder';

	constructor(
		readonly name: string,
		readonly columns: AnyMySqlColumn<TTableName>[],
		readonly config: IndexConfig<TTableName> = {},
	) {}

	/** @internal */
	build(table: AnyMySqlTable<TTableName>): Index<TTableName> {
		return new Index(this.name, table, this.columns, this);
	}
}

export type AnyIndexBuilder<TTableName extends string = string> = IndexBuilder<TTableName>;

export class Index<TTableName extends string> {
	protected typeKeeper!: {
		tableName: TTableName;
	};

	readonly config: IndexConfig<TTableName>;

	constructor(
		readonly name: string,
		readonly table: AnyMySqlTable<TTableName>,
		readonly columns: AnyMySqlColumn<TTableName>[],
		builder: IndexBuilder<TTableName>,
	) {
		this.config = builder.config;
	}
}

export type AnyIndex = Index<any>;

export type BuildIndex<T extends AnyIndexBuilder> = T extends IndexBuilder<infer TTableName> ? Index<TTableName>
	: never;

type GetColumnsTable<TColumns> = TColumns extends AnyMySqlColumn ? InferColumnTable<TColumns>
	: TColumns extends AnyMySqlColumn[] ? InferColumnTable<TColumns[number]>
	: never;

export function index<
	TColumns extends
		| AnyMySqlColumn
		| [AnyMySqlColumn, ...AnyMySqlColumn[]],
>(
	name: string,
	columns: TColumns,
	config?: IndexConfig<GetColumnsTable<TColumns>>,
): IndexBuilder<GetColumnsTable<TColumns>> {
	return new IndexBuilder(name, Array.isArray(columns) ? columns : [columns], config);
}

export function uniqueIndex() {}
