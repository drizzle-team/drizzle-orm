import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlYearBuilderInitial<TName extends string> = MsSqlYearBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlYear';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class MsSqlYearBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlYear'>> extends MsSqlColumnBuilder<T> {
	static readonly [entityKind]: string = 'MsSqlYearBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MsSqlYear');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlYear<MakeColumnConfig<T, TTableName>> {
		return new MsSqlYear<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlYear<
	T extends ColumnBaseConfig<'number', 'MsSqlYear'>,
> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlYear';

	getSQLType(): string {
		return `year`;
	}
}

export function year<TName extends string>(name: TName): MsSqlYearBuilderInitial<TName> {
	return new MsSqlYearBuilder(name);
}
