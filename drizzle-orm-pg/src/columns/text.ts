import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyPgTable } from '~/table';

import { PgColumn, PgColumnBuilder } from './common';

export class PgTextBuilder<TData extends string = string> extends PgColumnBuilder<
	ColumnBuilderConfig<{ data: TData; driverParam: string }>
> {
	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgText<TTableName, TData> {
		return new PgText(table, this);
	}
}

export class PgText<TTableName extends string, TData extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgText';

	constructor(table: AnyPgTable<{ name: TTableName }>, builder: PgTextBuilder<TData>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'text';
	}
}

export function text<T extends string = string>(name: string): PgTextBuilder<T> {
	return new PgTextBuilder(name);
}
