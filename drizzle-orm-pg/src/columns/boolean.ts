import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';

import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgBooleanBuilder extends PgColumnBuilder<
	ColumnBuilderConfig<{
		data: boolean;
		driverParam: boolean;
	}>
> {
	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgBoolean<TTableName> {
		return new PgBoolean(table, this);
	}
}

export class PgBoolean<TTableName extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: boolean; driverParam: boolean }>>
{
	protected override $pgColumnBrand!: 'PgBoolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(name: string) {
	return new PgBooleanBuilder(name);
}
