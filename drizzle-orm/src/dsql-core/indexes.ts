import { entityKind, is } from '~/entity.ts';
import { SQL } from '~/sql/sql.ts';
import type { AnyDSQLColumn } from './columns/common.ts';
import { ExtraConfigColumn, IndexedColumn } from './columns/common.ts';
import type { DSQLTable } from './table.ts';

export type IndexType = 'btree' | 'hash';

export interface IndexConfig {
	name?: string;
	columns: (IndexedColumn | SQL)[];
	unique: boolean;
	where?: SQL;
	concurrently?: boolean;
	method?: IndexType;
}

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'DSQLIndexBuilderOn';

	constructor(private unique: boolean, private name?: string) {}

	on(
		...columns: [AnyDSQLColumn | ExtraConfigColumn | SQL, ...(AnyDSQLColumn | ExtraConfigColumn | SQL)[]]
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

				it = it as AnyDSQLColumn;

				return new IndexedColumn(
					it.name,
					!!it.keyAsName,
					it.columnType,
					{},
				);
			}),
			this.unique,
			this.name,
		);
	}

	using(
		method: IndexType,
		...columns: [AnyDSQLColumn | ExtraConfigColumn | SQL, ...(AnyDSQLColumn | ExtraConfigColumn | SQL)[]]
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

				it = it as AnyDSQLColumn;

				return new IndexedColumn(
					it.name,
					!!it.keyAsName,
					it.columnType,
					{},
				);
			}),
			this.unique,
			this.name,
			method,
		);
	}
}

export interface AnyIndexBuilder {
	build(table: DSQLTable): Index;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IndexBuilder extends AnyIndexBuilder {}

export class IndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'DSQLIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(
		columns: (IndexedColumn | SQL)[],
		unique: boolean,
		name?: string,
		method: IndexType = 'btree',
	) {
		this.config = {
			name,
			columns,
			unique,
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
	build(table: DSQLTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'DSQLIndex';

	readonly config: IndexConfig & { table: DSQLTable };

	constructor(config: IndexConfig, table: DSQLTable) {
		this.config = { ...config, table };
	}
}

export function index(name?: string): IndexBuilderOn {
	return new IndexBuilderOn(false, name);
}

export function uniqueIndex(name?: string): IndexBuilderOn {
	return new IndexBuilderOn(true, name);
}
