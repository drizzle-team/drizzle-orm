import { ColumnConfig } from '~/column';
import { ColumnBuilderConfig } from '~/column-builder';
import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgMacaddrBuilder extends PgColumnBuilder<ColumnBuilderConfig<{ data: string; driverParam: string }>> {
	protected override $pgColumnBuilderBrand!: 'PgMacaddrBuilder';

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgMacaddr<TTableName> {
		return new PgMacaddr(table, this.config);
	}
}

export class PgMacaddr<TTableName extends string> extends PgColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: string;
		driverParam: string;
	}>
> {
	protected override $pgColumnBrand!: 'PgMacaddr';

	getSQLType(): string {
		return 'macaddr';
	}
}

export function macaddr(name: string) {
	return new PgMacaddrBuilder(name);
}
