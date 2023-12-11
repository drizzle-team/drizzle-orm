import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlTinyIntBuilderInitial<TName extends string> = MsSqlTinyIntBuilder<
	{
		name: TName;
		dataType: 'number';
		columnType: 'MsSqlTinyInt';
		data: number;
		driverParam: number | string;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MsSqlTinyIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlTinyInt'>>
	extends MsSqlColumnBuilderWithIdentity<T>
{
	static readonly [entityKind]: string = 'MsSqlTinyIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MsSqlTinyInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlTinyInt<MakeColumnConfig<T, TTableName>> {
		return new MsSqlTinyInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlTinyInt<T extends ColumnBaseConfig<'number', 'MsSqlTinyInt'>> extends MsSqlColumnWithIdentity<T> {
	static readonly [entityKind]: string = 'MsSqlTinyInt';

	_getSQLType(): string {
		return `tinyint`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function tinyint<TName extends string>(name: TName): MsSqlTinyIntBuilderInitial<TName> {
	return new MsSqlTinyIntBuilder(name);
}
