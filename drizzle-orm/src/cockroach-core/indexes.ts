import { entityKind, is } from '~/entity.ts';
import { SQL } from '~/sql/sql.ts';
import { ExtraConfigColumn } from './columns/index.ts';
import type { CockroachColumn } from './columns/index.ts';
import { IndexedColumn } from './columns/index.ts';
import type { CockroachTable } from './table.ts';

interface IndexConfig {
	name?: string;

	columns: Partial<IndexedColumn | SQL>[];

	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique: boolean;

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

export type IndexColumn = CockroachColumn;

export type CockroachIndexMethod =
	| 'btree'
	| 'hash'
	| 'gin'
	| 'cspann';

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'CockroachIndexBuilderOn';

	constructor(private unique: boolean, private name?: string) {}

	on(
		...columns: [
			Partial<ExtraConfigColumn> | SQL | CockroachColumn,
			...Partial<ExtraConfigColumn | SQL | CockroachColumn>[],
		]
	): IndexBuilder {
		return new IndexBuilder(
			columns.map((it) => {
				if (is(it, SQL)) {
					return it;
				}

				if (is(it, ExtraConfigColumn)) {
					const clonedIndexedColumn = new IndexedColumn(
						it.name,
						!!it.keyAsName,
						it.columnType!,
						it.indexConfig!,
					);
					it.indexConfig = JSON.parse(JSON.stringify(it.defaultConfig));
					return clonedIndexedColumn;
				}

				it = it as CockroachColumn;
				return new IndexedColumn(
					it.name,
					!!it.keyAsName,
					it.columnType!,
					{},
				);
			}),
			this.unique,
			false,
			this.name,
		);
	}

	onOnly(
		...columns: [
			Partial<ExtraConfigColumn | SQL | CockroachColumn>,
			...Partial<ExtraConfigColumn | SQL | CockroachColumn>[],
		]
	): IndexBuilder {
		return new IndexBuilder(
			columns.map((it) => {
				if (is(it, SQL)) {
					return it;
				}

				if (is(it, ExtraConfigColumn)) {
					const clonedIndexedColumn = new IndexedColumn(
						it.name,
						!!it.keyAsName,
						it.columnType!,
						it.indexConfig!,
					);
					it.indexConfig = JSON.parse(JSON.stringify(it.defaultConfig));
					return clonedIndexedColumn;
				}

				it = it as CockroachColumn;
				return new IndexedColumn(
					it.name,
					!!it.keyAsName,
					it.columnType!,
					{},
				);
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
		method: CockroachIndexMethod,
		...columns: [
			Partial<ExtraConfigColumn | SQL | CockroachColumn>,
			...Partial<ExtraConfigColumn | SQL | CockroachColumn>[],
		]
	): IndexBuilder {
		return new IndexBuilder(
			columns.map((it) => {
				if (is(it, SQL)) {
					return it;
				}

				if (is(it, ExtraConfigColumn)) {
					const clonedIndexedColumn = new IndexedColumn(
						it.name,
						!!it.keyAsName,
						it.columnType!,
						it.indexConfig!,
					);
					it.indexConfig = JSON.parse(JSON.stringify(it.defaultConfig));
					return clonedIndexedColumn;
				}

				it = it as CockroachColumn;
				return new IndexedColumn(
					it.name,
					!!it.keyAsName,
					it.columnType!,
					{},
				);
			}),
			this.unique,
			true,
			this.name,
			method,
		);
	}
}

export interface AnyIndexBuilder {
	build(table: CockroachTable): Index;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IndexBuilder extends AnyIndexBuilder {}

export class IndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'CockroachIndexBuilder';

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

	where(condition: SQL): this {
		this.config.where = condition;
		return this;
	}

	/** @internal */
	build(table: CockroachTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'CockroachIndex';

	readonly config: IndexConfig & { table: CockroachTable };
	readonly isNameExplicit: boolean;

	constructor(config: IndexConfig, table: CockroachTable) {
		this.config = { ...config, table };
		this.isNameExplicit = !!config.name;
	}
}

export type GetColumnsTableName<TColumns> = TColumns extends CockroachColumn ? TColumns['_']['name']
	: TColumns extends CockroachColumn[] ? TColumns[number]['_']['name']
	: never;

export function index(name?: string): IndexBuilderOn {
	return new IndexBuilderOn(false, name);
}

export function uniqueIndex(name?: string): IndexBuilderOn {
	return new IndexBuilderOn(true, name);
}
