import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { AnySingleStoreColumn, SingleStoreColumn } from './columns/index.ts';
import type { SingleStoreTable } from './table.ts';

interface IndexConfig {
	name: string;

	columns: IndexColumn[];

	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique?: boolean;

	/**
	 * If set, the index will be created as `create index ... using { 'btree' | 'hash' }`.
	 */
	using?: 'btree' | 'hash';

	/**
	 * If set, the index will be created as `create index ... algorithm { 'default' | 'inplace' | 'copy' }`.
	 */
	algorithm?: 'default' | 'inplace' | 'copy';

	/**
	 * If set, adds locks to the index creation.
	 */
	lock?: 'default' | 'none' | 'shared' | 'exclusive';
}

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

	algorithm(algorithm: IndexConfig['algorithm']): this {
		this.config.algorithm = algorithm;
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

	readonly config: IndexConfig & { table: SingleStoreTable };
	readonly isNameExplicit: boolean;

	constructor(config: IndexConfig, table: SingleStoreTable) {
		this.config = { ...config, table };
		this.isNameExplicit = !!config.name;
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

/* export interface AnyFullTextIndexBuilder {
	build(table: SingleStoreTable): FullTextIndex;
} */
/*
interface FullTextIndexConfig {
	version?: number;
}

interface FullTextIndexFullConfig extends FullTextIndexConfig {
	columns: IndexColumn[];

	name: string;
}

export class FullTextIndexBuilderOn {
	static readonly [entityKind]: string = 'SingleStoreFullTextIndexBuilderOn';

	constructor(private name: string, private config: FullTextIndexConfig) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): FullTextIndexBuilder {
		return new FullTextIndexBuilder({
			name: this.name,
			columns: columns,
			...this.config,
		});
	}
} */

/*
export interface FullTextIndexBuilder extends AnyFullTextIndexBuilder {}

export class FullTextIndexBuilder implements AnyFullTextIndexBuilder {
	static readonly [entityKind]: string = 'SingleStoreFullTextIndexBuilder'; */

/** @internal */
/* config: FullTextIndexFullConfig;

	constructor(config: FullTextIndexFullConfig) {
		this.config = config;
	} */

/** @internal */
/* build(table: SingleStoreTable): FullTextIndex {
		return new FullTextIndex(this.config, table);
	}
}

export class FullTextIndex {
	static readonly [entityKind]: string = 'SingleStoreFullTextIndex';

	readonly config: FullTextIndexConfig & { table: SingleStoreTable };

	constructor(config: FullTextIndexConfig, table: SingleStoreTable) {
		this.config = { ...config, table };
	}
}

export function fulltext(name: string, config: FullTextIndexConfig): FullTextIndexBuilderOn {
	return new FullTextIndexBuilderOn(name, config);
}

export type SortKeyColumn = SingleStoreColumn | SQL;

export class SortKeyBuilder {
	static readonly [entityKind]: string = 'SingleStoreSortKeyBuilder';

	constructor(private columns: SortKeyColumn[]) {} */

/** @internal */
/* build(table: SingleStoreTable): SortKey {
		return new SortKey(this.columns, table);
	}
}

export class SortKey {
	static readonly [entityKind]: string = 'SingleStoreSortKey';

	constructor(public columns: SortKeyColumn[], public table: SingleStoreTable) {}
}

export function sortKey(...columns: SortKeyColumn[]): SortKeyBuilder {
	return new SortKeyBuilder(columns);
}
 */
