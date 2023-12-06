import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlSmallIntBuilderInitial<TName extends string> = MsSqlSmallIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlSmallInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MsSqlSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlSmallInt'>>
	extends MsSqlColumnBuilderWithIdentity<T>
{
	static readonly [entityKind]: string = 'MsSqlSmallIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MsSqlSmallInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlSmallInt<MakeColumnConfig<T, TTableName>> {
		return new MsSqlSmallInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlSmallInt<T extends ColumnBaseConfig<'number', 'MsSqlSmallInt'>> extends MsSqlColumnWithIdentity<T> {
	static readonly [entityKind]: string = 'MsSqlSmallInt';

	_getSQLType(): string {
		return `smallint`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function smallint<TName extends string>(
	name: TName,
): MsSqlSmallIntBuilderInitial<TName> {
	return new MsSqlSmallIntBuilder(name);
}
