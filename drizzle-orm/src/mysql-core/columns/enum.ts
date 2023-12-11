import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import type { Writable } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlEnumColumnBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	MySqlEnumColumnBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'MySqlEnumColumn';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
		generated: undefined;
	}>;

export class MySqlEnumColumnBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlEnumColumn'>>
	extends MySqlColumnBuilder<T, { enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'MySqlEnumColumnBuilder';

	constructor(name: T['name'], values: T['enumValues']) {
		super(name, 'string', 'MySqlEnumColumn');
		this.config.enumValues = values;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlEnumColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new MySqlEnumColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlEnumColumn<T extends ColumnBaseConfig<'string', 'MySqlEnumColumn'>>
	extends MySqlColumn<T, { enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'MySqlEnumColumn';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return `enum(${this.enumValues!.map((value) => `'${value}'`).join(',')})`;
	}
}

export function mysqlEnum<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	values: T | Writable<T>,
): MySqlEnumColumnBuilderInitial<TName, Writable<T>> {
	if (values.length === 0) {
		throw new Error(`You have an empty array for "${name}" enum values`);
	}

	return new MySqlEnumColumnBuilder(name, values);
}
