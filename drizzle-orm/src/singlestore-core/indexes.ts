import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { AnySingleStoreColumn, SingleStoreColumn } from './columns/index.ts';
import type { SingleStoreColumnstoreTable, SingleStoreRowstoreTable, SingleStoreTable } from './table.ts';

interface IndexCommonConfig {
	name: string;

	columns: IndexColumn[];

	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique?: boolean;

	/**
	 * If set, the index will be created as `create index ... algorythm { 'default' | 'inplace' | 'copy' }`.
	 */
	algorythm?: 'default' | 'inplace' | 'copy';

	/**
	 * If set, adds locks to the index creation.
	 */
	lock?: 'default' | 'none' | 'shared' | 'exclusive';
}

type IndexColumnstoreConfig = IndexCommonConfig & {
	/**
	 * If set, the index will be created as `create index ... using { 'hash' }`.
	 */
	using?: 'hash';
};
type IndexRowstoreConfig = IndexCommonConfig & {
	/**
	 * If set, the index will be created as `create index ... using { 'btree' | 'hash' }`.
	 */
	using?: 'btree' | 'hash';
};
type IndexConfig = IndexColumnstoreConfig | IndexRowstoreConfig;

export type IndexColumn = SingleStoreColumn | SQL;

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'SingleStoreIndexBuilderOn';

	constructor(private name: string, private unique: boolean) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(this.name, columns, this.unique);
	}
}

export interface AnyIndexBuilder {
	build(table: SingleStoreTable): Index;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IndexBuilder extends AnyIndexBuilder {}

export class IndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'SingleStoreIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(name: string, columns: IndexColumn[], unique: boolean) {
		this.config = {
			name,
			columns,
			unique,
		};
	}

	using(using: IndexConfig['using']): this {
		this.config.using = using;
		return this;
	}

	algorythm(algorythm: IndexConfig['algorythm']): this {
		this.config.algorythm = algorythm;
		return this;
	}

	lock(lock: IndexConfig['lock']): this {
		this.config.lock = lock;
		return this;
	}

	/** @internal */
	build(table: SingleStoreTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'SingleStoreIndex';

	readonly config:
		| (IndexColumnstoreConfig & { table: SingleStoreColumnstoreTable })
		| (IndexRowstoreConfig & { table: SingleStoreRowstoreTable });

	constructor(config: IndexConfig, table: SingleStoreTable) {
		this.config = { ...config, table };
	}
}

export type GetColumnsTableName<TColumns> = TColumns extends
	AnySingleStoreColumn<{ tableName: infer TTableName extends string }> | AnySingleStoreColumn<
		{ tableName: infer TTableName extends string }
	>[] ? TTableName
	: never;

export function index(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, false);
}

export function uniqueIndex(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, true);
}
