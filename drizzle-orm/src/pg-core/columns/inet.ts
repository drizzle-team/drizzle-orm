import { ColumnConfig } from '~/column';
import { ColumnBuilderConfig } from '~/column-builder';
import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgInetBuilder extends PgColumnBuilder<ColumnBuilderConfig<{ data: string; driverParam: string }>> {
	protected override $pgColumnBuilderBrand!: 'PgInetBuilder';

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgInet<TTableName> {
		return new PgInet(table, this.config);
	}
}

export class PgInet<TTableName extends string> extends PgColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: string;
		driverParam: string;
	}>
> {
	protected override $pgColumnBrand!: 'PgInet';

	getSQLType(): string {
		return 'inet';
	}
}

export function inet(name: string) {
	return new PgInetBuilder(name);
}
