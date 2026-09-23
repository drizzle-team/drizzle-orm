import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { FirebirdColumn } from './columns/index.ts';
import type { FirebirdTable } from './table.ts';

export interface IndexConfig {
	name: string;
	columns: IndexColumn[];
	unique: boolean;
	where: SQL | undefined;
}

export type IndexColumn = FirebirdColumn | SQL;

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'FirebirdIndexBuilderOn';

	constructor(private name: string, private unique: boolean) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(this.name, columns, this.unique);
	}
}

export class IndexBuilder {
	static readonly [entityKind]: string = 'FirebirdIndexBuilder';

	declare _: {
		brand: 'FirebirdIndexBuilder';
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
	build(table: FirebirdTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'FirebirdIndex';

	declare _: {
		brand: 'FirebirdIndex';
	};

	readonly config: IndexConfig & { table: FirebirdTable };

	constructor(config: IndexConfig, table: FirebirdTable) {
		this.config = { ...config, table };
	}
}

export function index(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, false);
}

export function uniqueIndex(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, true);
}
