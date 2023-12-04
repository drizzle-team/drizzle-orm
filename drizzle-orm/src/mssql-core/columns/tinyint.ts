import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithAutoIncrement, MsSqlColumnWithAutoIncrement } from './common.ts';
import type { MsSqlIntConfig } from './int.ts';

export type MsSqlTinyIntBuilderInitial<TName extends string> = MsSqlTinyIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlTinyInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MsSqlTinyIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlTinyInt'>>
	extends MsSqlColumnBuilderWithAutoIncrement<T, MsSqlIntConfig>
{
	static readonly [entityKind]: string = 'MsSqlTinyIntBuilder';

	constructor(name: T['name'], config?: MsSqlIntConfig) {
		super(name, 'number', 'MsSqlTinyInt');
		this.config.unsigned = config ? config.unsigned : false;
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

export class MsSqlTinyInt<T extends ColumnBaseConfig<'number', 'MsSqlTinyInt'>>
	extends MsSqlColumnWithAutoIncrement<T, MsSqlIntConfig>
{
	static readonly [entityKind]: string = 'MsSqlTinyInt';

	getSQLType(): string {
		return `tinyint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function tinyint<TName extends string>(name: TName, config?: MsSqlIntConfig): MsSqlTinyIntBuilderInitial<TName> {
	return new MsSqlTinyIntBuilder(name, config);
}
