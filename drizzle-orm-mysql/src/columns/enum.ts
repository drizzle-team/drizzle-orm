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

export class MySqlEnumColumnBuilder<TData extends string = string> extends MySqlColumnBuilder<
	ColumnBuilderConfig<{ data: TData; driverParam: string }>,
	{ enum: MySqlEnum<TData> }
> {
	constructor(name: string, enumInstance: MySqlEnum<TData>) {
		super(name);
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlEnumColumn<TTableName, TData> {
		return new MySqlEnumColumn(table, this.config);
	}
}

export class MySqlEnumColumn<TTableName extends string, TData extends string>
	extends MySqlColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $mySqlColumnBrand!: 'MySqlEnumColumn';

	readonly enum: MySqlEnum<TData>;

	constructor(
		table: AnyMySqlTable<{ name: TTableName }>,
		config: MySqlEnumColumnBuilder<TData>['config'],
	) {
		super(table, config);
		this.enum = config.enum;
	}

	getSQLType(): string {
		return this.enum.enumName;
	}
}

export function mysqlEnum<T extends string = string>(enumName: string, values: T[]) {
	const enumInstance: MySqlEnum<T> = {
		enumName,
		enumValues: values,
		[isMySqlEnumSym]: true,
	};
	const columnFactory = (name: string) => new MySqlEnumColumnBuilder<T>(name, enumInstance);

	return Object.assign(columnFactory, enumInstance);
}
