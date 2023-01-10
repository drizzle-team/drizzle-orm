import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

const isMySqlEnumSym = Symbol('isMySqlEnum');
export interface MySqlEnum<TValues extends string> {
	readonly enumName: string;
	readonly enumValues: TValues[];
	/** @internal */
	[isMySqlEnumSym]: true;
}

export function isMySqlEnum(obj: unknown): obj is MySqlEnum<string> {
	return !!obj && typeof obj === 'function' && isMySqlEnumSym in obj;
}

export class MySqlEnumColumnBuilder<TData extends string = string>
	extends MySqlColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: string }>>
{
	/** @internal */ values: string[];
	/** @internal */ enumName: string;

	constructor(name: string, enumName: string, values: string[]) {
		super(name);
		this.enumName = enumName;
		this.values = values;
	}
	/** @internal */
	override build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>): MySqlEnumColumn<TTableName, TData> {
		return new MySqlEnumColumn(table, this, this.enumName);
	}
}

export class MySqlEnumColumn<TTableName extends string, TData extends string>
	extends MySqlColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $mySqlColumnBrand!: 'MySqlEnumColumn';

	constructor(
		table: AnyMySqlTable<{ name: TTableName }>,
		builder: MySqlEnumColumnBuilder<TData>,
		readonly enumName: string,
	) {
		super(table, builder);
	}

	getSQLType(): string {
		return this.enumName;
	}
}

export function mysqlEnum<T extends string = string>(enumName: string, values: T[]) {
	const enumValue: MySqlEnum<T> = {
		enumName,
		enumValues: values,
		[isMySqlEnumSym]: true,
	};
	const columnFactory = (name: string) => new MySqlEnumColumnBuilder<T>(name, enumName, values);

	return Object.assign(columnFactory, enumValue);
}
