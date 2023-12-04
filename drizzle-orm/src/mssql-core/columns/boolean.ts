import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlBooleanBuilderInitial<TName extends string> = MsSqlBooleanBuilder<{
	name: TName;
	dataType: 'boolean';
	columnType: 'MsSqlBoolean';
	data: boolean;
	driverParam: number | boolean;
	enumValues: undefined;
}>;

export class MsSqlBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'MsSqlBoolean'>>
	extends MsSqlColumnBuilder<T>
{
	static readonly [entityKind]: string = 'MsSqlBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'MsSqlBoolean');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlBoolean<MakeColumnConfig<T, TTableName>> {
		return new MsSqlBoolean<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlBoolean<T extends ColumnBaseConfig<'boolean', 'MsSqlBoolean'>> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlBoolean';

	getSQLType(): string {
		return 'boolean';
	}

	override mapFromDriverValue(value: number | boolean): boolean {
		if (typeof value === 'boolean') {
			return value;
		}
		return value === 1;
	}
}

export function boolean<TName extends string>(name: TName): MsSqlBooleanBuilderInitial<TName> {
	return new MsSqlBooleanBuilder(name);
}
