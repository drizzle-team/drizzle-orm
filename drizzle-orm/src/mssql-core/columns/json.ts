import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlJsonBuilderInitial<TName extends string> = MsSqlJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'MsSqlJson';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
}>;

export class MsSqlJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'MsSqlJson'>> extends MsSqlColumnBuilder<T> {
	static readonly [entityKind]: string = 'MsSqlJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'MsSqlJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlJson<MakeColumnConfig<T, TTableName>> {
		return new MsSqlJson<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlJson<T extends ColumnBaseConfig<'json', 'MsSqlJson'>> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlJson';

	getSQLType(): string {
		return 'json';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export function json<TName extends string>(name: TName): MsSqlJsonBuilderInitial<TName> {
	return new MsSqlJsonBuilder(name);
}
