import type { SQL } from '~/sql';

import type { AnySQLiteColumn } from './columns';
import type { AnySQLiteTable } from './table';

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
	declare _: {
		brand: 'SQLiteIndexBuilder';
	};

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
		return new Index(this.config, table);
	}
}

export class Index {
	declare _: {
		brand: 'SQLiteIndex';
	};

	readonly config: IndexConfig & { table: AnySQLiteTable };

	constructor(config: IndexConfig, table: AnySQLiteTable) {
		this.config = { ...config, table };
	}
}

export function index(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, false);
}

export function uniqueIndex(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, true);
}
