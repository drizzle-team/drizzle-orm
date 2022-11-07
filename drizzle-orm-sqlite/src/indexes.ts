import { SQL } from 'drizzle-orm/sql';

import { AnySQLiteColumn } from './columns';
import { AnySQLiteTable } from './table';

interface IndexConfig {
	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique: boolean;

	/**
	 * Condition for partial index.
	 */
	where: SQL | undefined;
}

export type IndexColumn = AnySQLiteColumn | SQL;

export class IndexBuilderOn {
	constructor(private name: string, private unique: boolean) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(this.name, columns, this.unique);
	}
}

export class IndexBuilder {
	declare protected $brand: 'SQLiteIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(name: string, columns: IndexColumn[], unique: boolean) {
		this.config = {
			unique,
			where: undefined,
		};
	}

	where(condition: SQL): this {
		this.config.where = condition;
		return this;
	}

	build(table: AnySQLiteTable): Index {
		return new Index(this.config);
	}
}

export class Index {
	declare protected $brand: 'SQLiteIndex';

	constructor(readonly config: IndexConfig) {}

	// TODO: move to .onConflict()
	// set(values: SQLiteUpdateSet<TTable>): { constraintName: string; set: SQLiteUpdateSet<TTable> } {
	// 	return {
	// 		constraintName: this.name,
	// 		set: values,
	// 	};
	// }
}

export type GetColumnsTableName<TColumns> = TColumns extends
	AnySQLiteColumn<{ tableName: infer TTableName extends string }> | AnySQLiteColumn<
		{ tableName: infer TTableName extends string }
	>[] ? TTableName
	: never;

export function index(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, false);
}

export function uniqueIndex(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, true);
}
