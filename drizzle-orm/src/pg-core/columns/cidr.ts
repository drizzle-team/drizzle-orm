import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgCidrBuilder extends PgColumnBuilder<ColumnBuilderConfig<{ data: string; driverParam: string }>> {
	protected override $pgColumnBuilderBrand!: 'PgCidrBuilder';

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgCidr<TTableName> {
		return new PgCidr(table, this.config);
	}
}

export class PgCidr<TTableName extends string> extends PgColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: string;
		driverParam: string;
	}>
> {
	protected override $pgColumnBrand!: 'PgCidr';

	getSQLType(): string {
		return 'cidr';
	}
}

export function cidr(name: string) {
	return new PgCidrBuilder(name);
}
