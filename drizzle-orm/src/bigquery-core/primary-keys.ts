import { entityKind } from '~/entity.ts';
import type { AnyBigQueryColumn, BigQueryColumn } from './columns/index.ts';
import { BigQueryTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnyBigQueryColumn<{ tableName: TTableName }>,
	TColumns extends AnyBigQueryColumn<{ tableName: TTableName }>[],
>(config: { name?: string; columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder;
/**
 * @deprecated: Please use primaryKey({ columns: [] }) instead of this function
 * @param columns
 */
export function primaryKey<
	TTableName extends string,
	TColumns extends AnyBigQueryColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder;
export function primaryKey(...config: any) {
	if (config[0].columns) {
		return new PrimaryKeyBuilder(config[0].columns, config[0].name);
	}
	return new PrimaryKeyBuilder(config);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'BigQueryPrimaryKeyBuilder';

	/** @internal */
	columns: BigQueryColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: BigQueryColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: BigQueryTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'BigQueryPrimaryKey';

	readonly columns: BigQueryColumn[];
	readonly name?: string;

	constructor(readonly table: BigQueryTable, columns: BigQueryColumn[], name?: string) {
		this.columns = columns;
		this.name = name;
	}

	getName(): string {
		return this.name
			?? `${this.table[BigQueryTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
