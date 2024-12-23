import type { CasingCache } from '~/casing.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgColumn, PgColumn } from './columns/index.ts';
import { PgTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumn extends AnyPgColumn<{ tableName: TTableName }>,
	TColumns extends AnyPgColumn<{ tableName: TTableName }>[],
>(config: { name?: string; columns: [TColumn, ...TColumns] }): PrimaryKeyBuilder;
/**
 * @deprecated: Please use primaryKey({ columns: [] }) instead of this function
 * @param columns
 */
export function primaryKey<
	TTableName extends string,
	TColumns extends AnyPgColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder;
export function primaryKey(...config: any) {
	if (config[0].columns) {
		return new PrimaryKeyBuilder(config[0].columns, config[0].name);
	}
	return new PrimaryKeyBuilder(config);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'PgPrimaryKeyBuilder';

	/** @internal */
	columns: PgColumn[];

	/** @internal */
	name?: string;

	constructor(
		columns: PgColumn[],
		name?: string,
	) {
		this.columns = columns;
		this.name = name;
	}

	/** @internal */
	build(table: PgTable, casing?: CasingCache): PrimaryKey {
		return new PrimaryKey(table, this.columns, this.name, casing);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'PgPrimaryKey';

	readonly columns: AnyPgColumn<{}>[];
	readonly name?: string;

	constructor(readonly table: PgTable, columns: AnyPgColumn<{}>[], name?: string, private casing?: CasingCache) {
		this.columns = columns;
		this.name = name;
	}

	getName(): string {
		return this.name ?? `${this.table[PgTable.Symbol.Name]}_${
			(
				this.casing
					? this.columns.map((column) => this.casing!.getColumnCasing(column))
					: this.columns.map((column) => column.name)
			).join('_')
		}_pk`;
	}
}
