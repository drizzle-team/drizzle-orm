import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { AnyMsSqlColumn, MsSqlColumn } from './columns/index.ts';
import type { MsSqlTable } from './table.ts';

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
	 * If set, the index will be created as `create index ... algorythm { 'default' | 'inplace' | 'copy' }`.
	 */
	algorythm?: 'default' | 'inplace' | 'copy';

	/**
	 * If set, adds locks to the index creation.
	 */
	lock?: 'default' | 'none' | 'shared' | 'exclusive';
}

export type IndexColumn = MsSqlColumn | SQL;

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'MsSqlIndexBuilderOn';

	constructor(private name: string, private unique: boolean) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(this.name, columns, this.unique);
	}
}

export interface AnyIndexBuilder {
	build(table: MsSqlTable): Index;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IndexBuilder extends AnyIndexBuilder {}

export class IndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'MsSqlIndexBuilder';

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
	build(table: MsSqlTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'MsSqlIndex';

	readonly config: IndexConfig & { table: MsSqlTable };

	constructor(config: IndexConfig, table: MsSqlTable) {
		this.config = { ...config, table };
	}
}

export type GetColumnsTableName<TColumns> = TColumns extends
	AnyMsSqlColumn<{ tableName: infer TTableName extends string }> | AnyMsSqlColumn<
		{ tableName: infer TTableName extends string }
	>[] ? TTableName
	: never;

export function index(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, false);
}

export function uniqueIndex(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, true);
}
