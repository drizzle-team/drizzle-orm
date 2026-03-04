import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { AnySurrealDBColumn, SurrealDBColumn } from './columns/index.ts';
import type { SurrealDBTable } from './table.ts';

export interface IndexConfig {
	name: string;
	columns: IndexColumn[];
	unique?: boolean;
}

export interface FullTextIndexConfig {
	name: string;
	columns: IndexColumn[];
	analyzer?: string;
	bm25?: boolean;
}

export type IndexColumn = SurrealDBColumn | SQL;

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'SurrealDBIndexBuilderOn';

	constructor(private name: string, private unique: boolean) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(this.name, columns, this.unique);
	}
}

export interface AnyIndexBuilder {
	build(table: SurrealDBTable): Index;
}

export interface IndexBuilder extends AnyIndexBuilder {}

export class IndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'SurrealDBIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(name: string, columns: IndexColumn[], unique: boolean) {
		this.config = {
			name,
			columns,
			unique,
		};
	}

	/** @internal */
	build(table: SurrealDBTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'SurrealDBIndex';

	readonly config: IndexConfig & { table: SurrealDBTable };

	constructor(config: IndexConfig, table: SurrealDBTable) {
		this.config = { ...config, table };
	}
}

export class FullTextIndexBuilderOn {
	static readonly [entityKind]: string = 'SurrealDBFullTextIndexBuilderOn';

	constructor(private name: string) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): FullTextIndexBuilder {
		return new FullTextIndexBuilder(this.name, columns);
	}
}

export class FullTextIndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'SurrealDBFullTextIndexBuilder';

	/** @internal */
	config: FullTextIndexConfig;

	constructor(name: string, columns: IndexColumn[]) {
		this.config = {
			name,
			columns,
		};
	}

	analyzer(name: string): this {
		this.config.analyzer = name;
		return this;
	}

	bm25(): this {
		this.config.bm25 = true;
		return this;
	}

	/** @internal */
	build(table: SurrealDBTable): Index {
		return new Index(
			{ name: this.config.name, columns: this.config.columns },
			table,
		);
	}
}

export type GetColumnsTableName<TColumns> = TColumns extends
	AnySurrealDBColumn<{ tableName: infer TTableName extends string }> | AnySurrealDBColumn<
		{ tableName: infer TTableName extends string }
	>[] ? TTableName
	: never;

export function index(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, false);
}

export function uniqueIndex(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, true);
}

export function fulltext(name: string): FullTextIndexBuilderOn {
	return new FullTextIndexBuilderOn(name);
}
