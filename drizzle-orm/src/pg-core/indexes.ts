import type { SQL } from '~/sql/sql.ts';

import { entityKind } from '~/entity.ts';
import type { PgColumn } from './columns/index.ts';
import type { PgTable } from './table.ts';

interface IndexConfig {
	name?: string;

	columns: IndexColumn[];

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

export type IndexColumn = PgColumn;

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'PgIndexBuilderOn';

	constructor(private unique: boolean, private name?: string) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(columns, this.unique, false, this.name);
	}

	onOnly(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(columns, this.unique, true, this.name);
	}
}

export interface AnyIndexBuilder {
	build(table: PgTable): Index;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IndexBuilder extends AnyIndexBuilder {}

export class IndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'PgIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(columns: IndexColumn[], unique: boolean, only: boolean, name?: string) {
		this.config = {
			name,
			columns,
			unique,
			only,
		};
	}

	concurrently(): this {
		this.config.concurrently = true;
		return this;
	}

	using(method: SQL): this {
		this.config.using = method;
		return this;
	}

	asc(): Omit<this, 'asc' | 'desc'> {
		this.config.order = 'asc';
		return this;
	}

	desc(): Omit<this, 'asc' | 'desc'> {
		this.config.order = 'desc';
		return this;
	}

	nullsFirst(): Omit<this, 'nullsFirst' | 'nullsLast'> {
		this.config.nulls = 'first';
		return this;
	}

	nullsLast(): Omit<this, 'nullsFirst' | 'nullsLast'> {
		this.config.nulls = 'last';
		return this;
	}

	where(condition: SQL): Omit<this, 'where'> {
		this.config.where = condition;
		return this;
	}

	/** @internal */
	build(table: PgTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'PgIndex';

	readonly config: IndexConfig & { table: PgTable };

	constructor(config: IndexConfig, table: PgTable) {
		this.config = { ...config, table };
	}
}

export type GetColumnsTableName<TColumns> = TColumns extends PgColumn ? TColumns['_']['name']
	: TColumns extends PgColumn[] ? TColumns[number]['_']['name']
	: never;

export function index(name?: string): IndexBuilderOn {
	return new IndexBuilderOn(false, name);
}

export function uniqueIndex(name?: string): IndexBuilderOn {
	return new IndexBuilderOn(true, name);
}
