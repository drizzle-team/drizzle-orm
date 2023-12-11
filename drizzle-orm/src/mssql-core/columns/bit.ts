import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlBitBuilderInitial<TName extends string> = MsSqlBitBuilder<
	{
		name: TName;
		dataType: 'boolean';
		columnType: 'MsSqlBit';
		data: boolean;
		driverParam: number | string;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MsSqlBitBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'MsSqlBit'>>
	extends MsSqlColumnBuilderWithIdentity<T>
{
	static readonly [entityKind]: string = 'MsSqlBitBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'MsSqlBit');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlBit<MakeColumnConfig<T, TTableName>> {
		return new MsSqlBit<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlBit<T extends ColumnBaseConfig<'boolean', 'MsSqlBit'>> extends MsSqlColumnWithIdentity<T> {
	static readonly [entityKind]: string = 'MsSqlBit';

	_getSQLType(): string {
		return `bit`;
	}

	override mapFromDriverValue = Boolean;
}

export function bit<TName extends string>(name: TName): MsSqlBitBuilderInitial<TName> {
	return new MsSqlBitBuilder(name);
}
