import { entityKind } from '~/entity.ts';
import type { AnyCockroachDbColumn, CockroachDbColumn } from './columns/index.ts';
import type { CockroachDbTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnyCockroachDbColumn<{ tableName: TTableName }>,
	TColumns extends AnyCockroachDbColumn<{ tableName: TTableName }>[],
>(config: { name?: string; columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder {
	return new PrimaryKeyBuilder(config.columns, config.name);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'CockroachDbPrimaryKeyBuilder';

	/** @internal */
	columns: CockroachDbColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: CockroachDbColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: CockroachDbTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'CockroachDbPrimaryKey';

	readonly columns: AnyCockroachDbColumn<{}>[];
	readonly name?: string;

	constructor(readonly table: CockroachDbTable, columns: AnyCockroachDbColumn<{}>[], name?: string) {
		this.columns = columns;
		this.name = name;
	}

	getName(): string | undefined {
		return this.name;
	}
}
