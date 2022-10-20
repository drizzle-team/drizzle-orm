import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgJsonbBuilder<TData> extends PgColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: string }>> {
	constructor(name: string) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgJsonb<TTableName, TData> {
		return new PgJsonb(table, this);
	}
}

export class PgJsonb<TTableName extends string, TData>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgJsonb';

	constructor(table: AnyPgTable<{ name: TTableName }>, builder: PgJsonbBuilder<TData>) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'jsonb';
	}

	override mapToDriverValue(value: TData): string {
		return JSON.stringify(value);
	}
}

export function jsonb<TData = any>(name: string): PgJsonbBuilder<TData> {
	return new PgJsonbBuilder(name);
}
