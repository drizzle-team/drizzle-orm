import { entityKind } from '~/entity.ts';
import type { AnyMySqlColumn, MySqlColumn } from './columns/index.ts';
import type { MySqlTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnyMySqlColumn<{ tableName: TTableName }>,
	TColumns extends AnyMySqlColumn<{ tableName: TTableName }>[],
>(config: { columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder;
/**
 * @deprecated: Please use primaryKey({ columns: [] }) instead of this function
 * @param columns
 */
export function primaryKey<
	TTableName extends string,
	TColumns extends AnyMySqlColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder;
export function primaryKey(...config: any) {
	if (config[0].columns) {
		return new PrimaryKeyBuilder(config[0].columns);
	}
	return new PrimaryKeyBuilder(config);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'MySqlPrimaryKeyBuilder';

	/** @internal */
	columns: MySqlColumn[];

	constructor(
		columns: MySqlColumn[],
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: MySqlTable): PrimaryKey {
		return new PrimaryKey(table, this.columns);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'MySqlPrimaryKey';

	readonly columns: MySqlColumn[];

	constructor(readonly table: MySqlTable, columns: MySqlColumn[]) {
		this.columns = columns;
	}
}
