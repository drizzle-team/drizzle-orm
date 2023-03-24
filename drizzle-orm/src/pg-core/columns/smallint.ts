import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgSmallIntBuilder extends PgColumnBuilder<
	ColumnBuilderConfig<{ data: number; driverParam: number | string }>
> {
	protected override $pgColumnBuilderBrand!: 'PgSmallIntBuilder';

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgSmallInt<TTableName> {
		return new PgSmallInt(table, this.config);
	}
}

export class PgSmallInt<TTableName extends string> extends PgColumn<
	ColumnConfig<{ tableName: TTableName; data: number; driverParam: number | string }>
> {
	protected override $pgColumnBrand!: 'PgSmallInt';

	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue = (value: number | string): number => {
		if (typeof value === 'string') {
			return parseInt(value);
		}
		return value;
	};
}

export function smallint(name: string) {
	return new PgSmallIntBuilder(name);
}
