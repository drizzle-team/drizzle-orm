import { SQL } from 'drizzle-orm/sql';

import { AnySQLiteColumn } from './columns';
import { AnySQLiteTable } from './table';

export interface IndexConfig {
	name: string;
	columns: IndexColumn[];
	unique: boolean;
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
			name,
			columns,
			unique,
			where: undefined,
		};
	}

	/**
	* Condition for partial index.
	*/
	where(condition: SQL): this {
		this.config.where = condition;
		return this;
	}

	/** @internal */
	build(table: AnySQLiteTable): Index {
		return new Index(this.config);
	}
}

export class Index {
	declare protected $brand: 'SQLiteIndex';

	constructor(readonly config: IndexConfig) {}
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
