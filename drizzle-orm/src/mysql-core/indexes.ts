import { SQL } from '~/sql';
import { AnyMySqlColumn } from './columns';
import { AnyMySqlTable } from './table';

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

export type IndexColumn = AnyMySqlColumn | SQL;

export class IndexBuilderOn {
	constructor(private name: string, private unique: boolean) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(this.name, columns, this.unique);
	}
}

export interface AnyIndexBuilder {
	build(table: AnyMySqlTable): Index;
}

export interface IndexBuilder extends AnyIndexBuilder {}

export class IndexBuilder implements AnyIndexBuilder {
	declare protected $brand: 'MySqlIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(name: string, columns: IndexColumn[], unique: boolean) {
		this.config = {
			name,
			columns,
			unique,
		};
	}

	using(using: IndexConfig['using']): Omit<this, 'using'> {
		this.config.using = using;
		return this;
	}

	algorythm(algorythm: IndexConfig['algorythm']): Omit<this, 'algorythm'> {
		this.config.algorythm = algorythm;
		return this;
	}

	lock(lock: IndexConfig['lock']): Omit<this, 'lock'> {
		this.config.lock = lock;
		return this;
	}

	/** @internal */
	build(table: AnyMySqlTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	declare protected $brand: 'MySqlIndex';

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
