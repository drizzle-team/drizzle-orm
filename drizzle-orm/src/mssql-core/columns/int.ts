import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlIntBuilderInitial<TName extends string> = MsSqlIntBuilder<
	{
		name: TName;
		dataType: 'number';
		columnType: 'MsSqlInt';
		data: number;
		driverParam: number;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MsSqlIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlInt'>>
	extends MsSqlColumnBuilderWithIdentity<T>
{
	static readonly [entityKind]: string = 'MsSqlIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MsSqlInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlInt<MakeColumnConfig<T, TTableName>> {
		return new MsSqlInt<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlInt<T extends ColumnBaseConfig<'number', 'MsSqlInt'>> extends MsSqlColumnWithIdentity<T> {
	static readonly [entityKind]: string = 'MsSqlInt';

	_getSQLType(): string {
		return `int`;
	}
}

export function int<TName extends string>(name: TName): MsSqlIntBuilderInitial<TName> {
	return new MsSqlIntBuilder(name);
}
