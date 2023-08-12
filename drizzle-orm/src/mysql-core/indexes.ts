import { entityKind } from '~/entity';
import type { SQL } from '~/sql';
import type { AnyMySqlColumn } from './columns';
import type { AnyMySqlTable } from './table';

interface IndexConfig {
	name: string;

	columns: IndexColumn[];

	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique?: boolean;

  /**
   * If true, the index will be created as `create fulltext index` instead of `create index`
   */
  fulltext?: boolean;

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

export type IndexColumn = AnyMySqlColumn | SQL;

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'MySqlIndexBuilderOn';

	constructor(private name: string, private unique: boolean, private fulltext?: boolean) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(this.name, columns, this.unique, this.fulltext);
	}
}

export interface AnyIndexBuilder {
	build(table: AnyMySqlTable): Index;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IndexBuilder extends AnyIndexBuilder {}

export class IndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'MySqlIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(name: string, columns: IndexColumn[], unique: boolean, fulltext?: boolean) {
    if (unique && fulltext) {
      throw new Error('Fulltext indexes cannot use "unique"');
    }

		this.config = {
			name,
			columns,
			unique,
      fulltext
		};
	}

	using(using: IndexConfig['using']): this {
    if (this.config.fulltext) {
      throw new Error('Fulltext indexes cannot use "using" statement.');
    }
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
	build(table: AnyMySqlTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'MySqlIndex';

	readonly config: IndexConfig & { table: AnyMySqlTable };

	constructor(config: IndexConfig, table: AnyMySqlTable) {
		this.config = { ...config, table };
	}
}

export type GetColumnsTableName<TColumns> = TColumns extends
	AnyMySqlColumn<{ tableName: infer TTableName extends string }> | AnyMySqlColumn<
		{ tableName: infer TTableName extends string }
	>[] ? TTableName
	: never;

export function index(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, false);
}

export function uniqueIndex(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, true);
}

export function fulltextIndex(name: string): IndexBuilderOn {
  return new IndexBuilderOn(name, false, true);
}
