import { entityKind } from '~/entity.ts';
import type { AnyMsSqlColumn, MsSqlColumn } from './columns/index.ts';
import type { MsSqlTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnyMsSqlColumn<{ tableName: TTableName }>,
	TColumns extends AnyMsSqlColumn<{ tableName: TTableName }>[],
>(config: { name?: string; columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder {
	return new PrimaryKeyBuilder(config.columns, config.name);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'MsSqlPrimaryKeyBuilder';

	/** @internal */
	columns: MsSqlColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: MsSqlColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: MsSqlTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'MsSqlPrimaryKey';

	readonly columns: MsSqlColumn[];
	readonly name?: string;

	constructor(readonly table: MsSqlTable, columns: MsSqlColumn[], name?: string) {
		this.columns = columns;
		this.name = name;
	}

	getName() {
		return this.name;
	}
}
