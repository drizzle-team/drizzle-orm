import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume, Writable } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlEnumColumnBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlEnumColumnBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlEnumColumnHKT;
}

export interface MySqlEnumColumnHKT extends ColumnHKTBase {
	_type: MySqlEnumColumn<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlEnumColumnBuilderInitial<TName extends string, TEnum extends string[]> = MySqlEnumColumnBuilder<{
	name: TName;
	data: TEnum[number];
	driverParam: string;
	enum: TEnum;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlEnumColumnBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilder<MySqlEnumColumnBuilderHKT, T, { values: string[] }>
{
	constructor(name: T['name'], values: string[]) {
		super(name);
		this.config.values = values;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlEnumColumn<MakeColumnConfig<T, TTableName>> {
		return new MySqlEnumColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config,
		);
	}
}

export class MySqlEnumColumn<T extends ColumnBaseConfig>
	extends MySqlColumn<MySqlEnumColumnHKT, T, { values: readonly string[] }>
{
	readonly values: readonly string[] = this.config.values;

	getSQLType(): string {
		return `enum(${this.values.map((value) => `'${value}'`).join(',')})`;
	}
}

export function mysqlEnum<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	values: T | Writable<T>,
): MySqlEnumColumnBuilderInitial<TName, Writable<T>>;
export function mysqlEnum(name: string, values: string[]) {
	if (values.length === 0) throw Error(`You have an empty array for "${name}" enum values`);

	return new MySqlEnumColumnBuilder(name, values);
}
