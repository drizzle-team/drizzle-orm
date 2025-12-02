import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { SQLiteColumn } from './columns/index.ts';
import type { SQLiteTable } from './table.ts';

export interface IndexConfig {
	name: string;
	columns: IndexColumn[];
	unique: boolean;
	where: SQL | undefined;
}

export type IndexColumn = SQLiteColumn | SQL;

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'SQLiteIndexBuilderOn';

	constructor(private name: string, private unique: boolean) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(this.name, columns, this.unique);
	}
}

export class IndexBuilder {
	static readonly [entityKind]: string = 'SQLiteIndexBuilder';

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
	build(table: SQLiteTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'SQLiteIndex';

	declare _: {
		brand: 'SQLiteIndex';
	};

	readonly config: IndexConfig & { table: SQLiteTable };
	readonly isNameExplicit: boolean;

	constructor(config: IndexConfig, table: SQLiteTable) {
		this.config = { ...config, table };
		this.isNameExplicit = !!config.name;
	}
}

export function index(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, false);
}

export function uniqueIndex(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, true);
}
