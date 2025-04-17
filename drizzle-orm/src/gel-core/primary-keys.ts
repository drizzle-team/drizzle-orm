import { entityKind } from '~/entity.ts';
import type { AnyGelColumn, GelColumn } from './columns/index.ts';
import { GelTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnyGelColumn<{ tableName: TTableName }>,
	TColumns extends AnyGelColumn<{ tableName: TTableName }>[],
>(config: { name?: string; columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder;
/**
 * @deprecated: Please use primaryKey({ columns: [] }) instead of this function
 * @param columns
 */
export function primaryKey<
	TTableName extends string,
	TColumns extends AnyGelColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder;
export function primaryKey(...config: any) {
	if (config[0].columns) {
		return new PrimaryKeyBuilder(config[0].columns, config[0].name);
	}
	return new PrimaryKeyBuilder(config);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'GelPrimaryKeyBuilder';

	/** @internal */
	columns: GelColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: GelColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: GelTable): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'GelPrimaryKey';

	readonly columns: AnyGelColumn<{}>[];
	readonly name?: string;

	constructor(readonly table: GelTable, columns: AnyGelColumn<{}>[], name?: string) {
		this.columns = columns;
		this.name = name;
	}

	getName(): string {
		return this.name ?? `${this.table[GelTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
