import { SQL } from '~/sql/sql.ts';

import { entityKind, is } from '~/entity.ts';
import type { CockroachDbColumn, ExtraConfigColumn } from './columns/index.ts';
import { IndexedColumn } from './columns/index.ts';
import type { CockroachDbTable } from './table.ts';

interface IndexConfig {
	name?: string;

	columns: Partial<IndexedColumn | SQL>[];

	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique: boolean;

	/**
	 * If true, the index will be created as `create index concurrently` instead of `create index`.
	 */
	concurrently?: boolean;

	/**
	 * If true, the index will be created as `create index ... on only <table>` instead of `create index ... on <table>`.
	 */
	only: boolean;

	/**
	 * Condition for partial index.
	 */
	where?: SQL;

	/**
	 * The optional USING clause method for the index
	 */
	method?: 'btree' | string;
}

export type IndexColumn = CockroachDbColumn;

export type CockroachDbIndexMethod =
	| 'btree'
	| 'hash'
	| 'gin'
	| 'cspann';

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'CockroachDbIndexBuilderOn';

	constructor(private unique: boolean, private name?: string) {}

	on(...columns: [Partial<ExtraConfigColumn> | SQL, ...Partial<ExtraConfigColumn | SQL>[]]): IndexBuilder {
		return new IndexBuilder(
			columns.map((it) => {
				if (is(it, SQL)) {
					return it;
				}
				it = it as ExtraConfigColumn;
				const clonedIndexedColumn = new IndexedColumn(it.name, !!it.keyAsName, it.columnType!, it.indexConfig!);
				it.indexConfig = JSON.parse(JSON.stringify(it.defaultConfig));
				return clonedIndexedColumn;
			}),
			this.unique,
			false,
			this.name,
		);
	}

	onOnly(...columns: [Partial<ExtraConfigColumn | SQL>, ...Partial<ExtraConfigColumn | SQL>[]]): IndexBuilder {
		return new IndexBuilder(
			columns.map((it) => {
				if (is(it, SQL)) {
					return it;
				}
				it = it as ExtraConfigColumn;
				const clonedIndexedColumn = new IndexedColumn(it.name, !!it.keyAsName, it.columnType!, it.indexConfig!);
				it.indexConfig = it.defaultConfig;
				return clonedIndexedColumn;
			}),
			this.unique,
			true,
			this.name,
		);
	}

	/**
	 * Specify what index method to use. Choices are `btree`, `hash`, `gin`, `cspann`. The default method is `btree`.
	 *
	 * @param method The name of the index method to be used
	 * @param columns
	 * @returns
	 */
	using(
		method: CockroachDbIndexMethod,
		...columns: [Partial<ExtraConfigColumn | SQL>, ...Partial<ExtraConfigColumn | SQL>[]]
	): IndexBuilder {
		return new IndexBuilder(
			columns.map((it) => {
				if (is(it, SQL)) {
					return it;
				}
				it = it as ExtraConfigColumn;
				const clonedIndexedColumn = new IndexedColumn(it.name, !!it.keyAsName, it.columnType!, it.indexConfig!);
				it.indexConfig = JSON.parse(JSON.stringify(it.defaultConfig));
				return clonedIndexedColumn;
			}),
			this.unique,
			true,
			this.name,
			method,
		);
	}
}

export interface AnyIndexBuilder {
	build(table: CockroachDbTable): Index;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IndexBuilder extends AnyIndexBuilder {}

export class IndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'CockroachDbIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(
		columns: Partial<IndexedColumn | SQL>[],
		unique: boolean,
		only: boolean,
		name?: string,
		method: string = 'btree',
	) {
		this.config = {
			name,
			columns,
			unique,
			only,
			method,
		};
	}

	concurrently(): this {
		this.config.concurrently = true;
		return this;
	}

	where(condition: SQL): this {
		this.config.where = condition;
		return this;
	}

	/** @internal */
	build(table: CockroachDbTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'CockroachDbIndex';

	readonly config: IndexConfig & { table: CockroachDbTable };

	constructor(config: IndexConfig, table: CockroachDbTable) {
		this.config = { ...config, table };
	}
}

export type GetColumnsTableName<TColumns> = TColumns extends CockroachDbColumn ? TColumns['_']['name']
	: TColumns extends CockroachDbColumn[] ? TColumns[number]['_']['name']
	: never;

export function index(name?: string): IndexBuilderOn {
	return new IndexBuilderOn(false, name);
}

export function uniqueIndex(name?: string): IndexBuilderOn {
	return new IndexBuilderOn(true, name);
}
