import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlYearBuilder
	extends MySqlColumnBuilder<ColumnBuilderConfig<{ data: string | number; driverParam: string | number }>>
{
	constructor(
		name: string,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlYear<TTableName> {
		return new MySqlYear(table, this);
	}
}

export class MySqlYear<
	TTableName extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: string | number;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlYear';

	constructor(
		table: AnyMySqlTable<{ name: TTableName }>,
		builder: MySqlYearBuilder,
	) {
		super(table, builder);
	}

	getSQLType(): string {
		return `year`;
	}
}


export function year(name: string) {
	return new MySqlYearBuilder(name);
}
