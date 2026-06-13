import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { IndexedColumn } from './columns/index.ts';
import type { AnyMsSqlColumn, MsSqlColumn } from './columns/index.ts';
import type { MsSqlTable } from './table.ts';
import type { MsSqlView } from './view.ts';

interface IndexConfig {
	name: string;

	kind: 'btree' | 'fulltext' | 'columnstore';
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

	fulltext?: MsSqlFullTextConfig;
}

export interface MsSqlIndexWith {
	fillFactor?: number;
	online?: boolean;
}

export interface MsSqlColumnStoreIndexWith {
	online?: boolean;
}

export interface MsSqlFullTextConfig {
	keyIndex: string;
	catalog?: string;
	changeTracking?: 'auto' | 'manual' | 'off';
	stoplist?: 'system' | 'off' | (string & {});
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
			kind: 'btree',
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

export class FullTextIndexBuilderOn {
	static readonly [entityKind]: string = 'MsSqlFullTextIndexBuilderOn';

	constructor(private name: string) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): FullTextIndexBuilder {
		return new FullTextIndexBuilder(this.name, columns.map(cloneColumn));
	}
}

export interface FullTextIndexBuilder extends AnyIndexBuilder {}

export class FullTextIndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'MsSqlFullTextIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(name: string, columns: IndexColumn[]) {
		this.config = {
			name,
			kind: 'fulltext',
			columns,
			fulltext: {
				keyIndex: '',
			},
		};
	}

	keyIndex(name: string): this {
		this.config.fulltext!.keyIndex = name;
		return this;
	}

	catalog(name: string): this {
		this.config.fulltext!.catalog = name;
		return this;
	}

	changeTracking(value: NonNullable<MsSqlFullTextConfig['changeTracking']>): this {
		this.config.fulltext!.changeTracking = value;
		return this;
	}

	stoplist(value: NonNullable<MsSqlFullTextConfig['stoplist']>): this {
		this.config.fulltext!.stoplist = value;
		return this;
	}

	/** @internal */
	build(table: IndexTarget): Index {
		if (!this.config.fulltext?.keyIndex) {
			throw new Error('Fulltext indexes require .keyIndex(name)');
		}
		return new Index(this.config, table);
	}
}

export class ColumnStoreIndexBuilderOn {
	static readonly [entityKind]: string = 'MsSqlColumnStoreIndexBuilderOn';

	constructor(private name: string) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): ColumnStoreIndexBuilder {
		return new ColumnStoreIndexBuilder(this.name, columns.map(cloneColumn), false);
	}
}

export interface ColumnStoreIndexBuilder extends AnyIndexBuilder {}

export class ColumnStoreIndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'MsSqlColumnStoreIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(name: string, columns: IndexColumn[] = [], clustered: boolean) {
		this.config = {
			name,
			kind: 'columnstore',
			columns,
			clustered,
		};
	}

	orderBy(...columns: [IndexColumn, ...IndexColumn[]]): this {
		this.config.columns = columns.map(cloneColumn);
		return this;
	}

	where(condition: SQL): this {
		this.config.where = condition;
		return this;
	}

	with(obj: MsSqlColumnStoreIndexWith): this {
		this.config.with = obj;
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

export function fullTextIndex(name: string): FullTextIndexBuilderOn {
	return new FullTextIndexBuilderOn(name);
}

export function columnStoreIndex(name: string): ColumnStoreIndexBuilderOn {
	return new ColumnStoreIndexBuilderOn(name);
}

export function clusteredColumnStoreIndex(name: string): ColumnStoreIndexBuilder {
	return new ColumnStoreIndexBuilder(name, [], true);
}
