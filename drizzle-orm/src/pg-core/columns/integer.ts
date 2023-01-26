import { ColumnConfig } from '~/column';
import { ColumnBuilderConfig } from '~/column-builder';
import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgIntegerBuilder
	extends PgColumnBuilder<ColumnBuilderConfig<{ data: number; driverParam: number | string }>>
{
	protected override $pgColumnBuilderBrand!: 'PgIntegerBuilder';

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgInteger<TTableName> {
		return new PgInteger(table, this.config);
	}
}

export class PgInteger<TTableName extends string> extends PgColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: number;
		driverParam: number | string;
	}>
> {
	protected override $pgColumnBrand!: 'PgInteger';

	getSQLType(): string {
		return 'integer';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return parseInt(value);
		}
		return value;
	}
}

export function integer(name: string) {
	return new PgIntegerBuilder(name);
}
