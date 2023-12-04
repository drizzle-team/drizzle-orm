import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlFloatBuilderInitial<TName extends string> = MsSqlFloatBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlFloat';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MsSqlFloatBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlFloat'>>
	extends MsSqlColumnBuilderWithIdentity<T>
{
	static readonly [entityKind]: string = 'MsSqlFloatBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MsSqlFloat');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlFloat<MakeColumnConfig<T, TTableName>> {
		return new MsSqlFloat<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlFloat<T extends ColumnBaseConfig<'number', 'MsSqlFloat'>> extends MsSqlColumnWithIdentity<T> {
	static readonly [entityKind]: string = 'MsSqlFloat';

	_getSQLType(): string {
		return 'float';
	}
}

export function float<TName extends string>(name: TName): MsSqlFloatBuilderInitial<TName> {
	return new MsSqlFloatBuilder(name);
}
