import { ColumnConfig } from '~/column';
import { ColumnBuilderConfig } from '~/column-builder';
import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgMacaddr8Builder extends PgColumnBuilder<ColumnBuilderConfig<{ data: string; driverParam: string }>> {
	protected override $pgColumnBuilderBrand!: 'PgMacaddr8Builder';

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgMacaddr8<TTableName> {
		return new PgMacaddr8(table, this.config);
	}
}

export class PgMacaddr8<TTableName extends string> extends PgColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: string;
		driverParam: string;
	}>
> {
	protected override $pgColumnBrand!: 'PgMacaddr8';

	getSQLType(): string {
		return 'macaddr8';
	}
}

export function macaddr8(name: string) {
	return new PgMacaddr8Builder(name);
}
