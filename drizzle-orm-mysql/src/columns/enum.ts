import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlEnumColumnBuilder<TData extends string = string>
	extends MySqlColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: string }>>
{
	/** @internal */ values: string[];

	constructor(name: string, values: string[]) {
		super(name);
		this.values = values;
	}
	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlEnumColumn<TTableName, TData> {
		return new MySqlEnumColumn(table, this);
	}
}

export class MySqlEnumColumn<TTableName extends string, TData extends string>
	extends MySqlColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $mySqlColumnBrand!: 'MySqlEnumColumn';

	values: string[];

	constructor(
		table: AnyMySqlTable<{ name: TTableName }>,
		builder: MySqlEnumColumnBuilder<TData>,
	) {
		super(table, builder);
		this.values = builder.values;
	}

	getSQLType(): string {
		return `ENUM(${this.values.map(value => `'${value}'`).join(',')})`;
	}
}

export function mysqlEnum<T extends string = string>(
	enumName: string,
	values: T[] extends never[] ? 'Enum array cannot be empty' : T[],
) {
	if (values.length === 0) throw Error(`You have an empty array for "${enumName}" enum values`);

	return new MySqlEnumColumnBuilder<T>(enumName, values as T[]);
}
