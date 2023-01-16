import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgVarcharBuilder<TData extends string = string>
	extends PgColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: string }>, { length: number | undefined }>
{
	protected override $pgColumnBuilderBrand!: 'PgVarcharBuilder';

	constructor(name: string, length?: number) {
		super(name);
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgVarchar<TTableName, TData> {
		return new PgVarchar(table, this.config);
	}
}

export class PgVarchar<TTableName extends string, TData extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgVarchar';

	length: number | undefined;

	constructor(table: AnyPgTable<{ name: TTableName }>, config: PgVarcharBuilder<TData>['config']) {
		super(table, config);
		this.length = config.length;
	}

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `varchar(${this.length})` : `varchar`;
	}
}

export function varchar<T extends string = string>(
	name: string,
	config: { length?: number } = {},
): PgVarcharBuilder<T> {
	return new PgVarcharBuilder(name, config.length);
}
