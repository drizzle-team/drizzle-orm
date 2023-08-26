import { entityKind } from '~/entity.ts';
import type { AnyPgColumn, PgColumn } from './columns/index.ts';
import { PgTable } from './table.ts';

export function primaryKey<
	TTableName extends string,
	TColumns extends AnyPgColumn<{ tableName: TTableName }>[],
>(...columns: TColumns): PrimaryKeyBuilder {
	return new PrimaryKeyBuilder(columns);
}

export class PrimaryKeyBuilder {
	static readonly [entityKind]: string = 'PgPrimaryKeyBuilder';

	/** @internal */
	columns: PgColumn[];

	constructor(
		columns: PgColumn[],
	) {
		this.columns = columns;
	}

	/** @internal */
	build(table: PgTable): PrimaryKey {
		return new PrimaryKey(table, this.columns);
	}
}

export class PrimaryKey {
	static readonly [entityKind]: string = 'PgPrimaryKey';

	readonly columns: AnyPgColumn<{}>[];

	constructor(readonly table: PgTable, columns: AnyPgColumn<{}>[]) {
		this.columns = columns;
	}

	getName(): string {
		return `${this.table[PgTable.Symbol.Name]}_${this.columns.map((column) => column.name).join('_')}_pk`;
	}
}
