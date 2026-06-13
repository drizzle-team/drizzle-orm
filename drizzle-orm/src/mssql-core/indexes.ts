import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { IndexedColumn } from './columns/index.ts';
import type { AnyMsSqlColumn, MsSqlColumn } from './columns/index.ts';
import type { MsSqlTable } from './table.ts';
import type { MsSqlView } from './view.ts';

interface IndexConfig {
	name: string;

	columns: IndexColumn[];
	include?: IndexColumn[];

	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique?: boolean;

	/**
	 * If true, the index will be created as `create clustered index` instead of `create index`.
	 */
	clustered?: boolean;

	/**
	 * Condition for partial index.
	 */
	where?: SQL;

	/**
	 * The optional WITH clause specifies storage options for the index.
	 */
	with?: MsSqlIndexWith;
}

export interface MsSqlIndexWith {
	fillFactor?: number;
	online?: boolean;
}

export type IndexColumn = MsSqlColumn | SQL | IndexedColumn;
export type IndexTarget = MsSqlTable | MsSqlView<any, any, any>;

const isMsSqlColumn = (column: IndexColumn): column is MsSqlColumn => {
	return 'defaultConfig' in column;
};

const cloneColumn = (column: IndexColumn): IndexColumn => {
	if (isMsSqlColumn(column)) {
		const indexConfig = { ...column.indexConfig };
		column.indexConfig = { ...column.defaultConfig };
		return new IndexedColumn(column.name, indexConfig);
	}

	return column;
};

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'MsSqlIndexBuilderOn';

	constructor(private name: string, private unique: boolean) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(this.name, columns.map(cloneColumn), this.unique);
	}
}

export interface AnyIndexBuilder {
	build(table: IndexTarget): Index;
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

	where(condition: SQL): this {
		this.config.where = condition;
		return this;
	}

	include(...columns: [IndexColumn, ...IndexColumn[]]): this {
		this.config.include = columns.map(cloneColumn);
		return this;
	}

	with(obj: MsSqlIndexWith): this {
		this.config.with = obj;
		return this;
	}

	clustered(): this {
		this.config.clustered = true;
		return this;
	}

	nonClustered(): this {
		this.config.clustered = false;
		return this;
	}

	/** @internal */
	build(table: IndexTarget): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'MsSqlIndex';

	readonly config: IndexConfig & { table: IndexTarget };
	readonly isNameExplicit: boolean;

	constructor(config: IndexConfig, table: IndexTarget) {
		this.config = { ...config, table };
		this.isNameExplicit = !!config.name;
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
