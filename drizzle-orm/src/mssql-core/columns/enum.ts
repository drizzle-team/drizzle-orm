import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import type { Writable } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlEnumColumnBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	MsSqlEnumColumnBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'MsSqlEnumColumn';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
	}>;

export class MsSqlEnumColumnBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlEnumColumn'>>
	extends MsSqlColumnBuilder<T, { enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'MsSqlEnumColumnBuilder';

	constructor(name: T['name'], values: T['enumValues']) {
		super(name, 'string', 'MsSqlEnumColumn');
		this.config.enumValues = values;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlEnumColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new MsSqlEnumColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlEnumColumn<T extends ColumnBaseConfig<'string', 'MsSqlEnumColumn'>>
	extends MsSqlColumn<T, { enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'MsSqlEnumColumn';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return `enum(${this.enumValues!.map((value) => `'${value}'`).join(',')})`;
	}
}

export function mssqlEnum<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	values: T | Writable<T>,
): MsSqlEnumColumnBuilderInitial<TName, Writable<T>> {
	if (values.length === 0) {
		throw new Error(`You have an empty array for "${name}" enum values`);
	}

	return new MsSqlEnumColumnBuilder(name, values);
}
