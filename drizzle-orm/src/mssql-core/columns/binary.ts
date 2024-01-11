import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlBinaryBuilderInitial<TName extends string> = MsSqlBinaryBuilder<
	{
		name: TName;
		dataType: 'buffer';
		columnType: 'MsSqlBinary';
		data: Buffer;
		driverParam: Buffer;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MsSqlBinaryBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'MsSqlBinary'>> extends MsSqlColumnBuilder<
	T,
	MsSqlBinaryConfig
> {
	static readonly [entityKind]: string = 'MsSqlBinaryBuilder';

	constructor(name: T['name'], length: number | undefined) {
		super(name, 'buffer', 'MsSqlBinary');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlBinary<MakeColumnConfig<T, TTableName>> {
		return new MsSqlBinary<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlBinary<T extends ColumnBaseConfig<'buffer', 'MsSqlBinary'>> extends MsSqlColumn<
	T,
	MsSqlBinaryConfig
> {
	static readonly [entityKind]: string = 'MsSqlBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `binary` : `binary(${this.length})`;
	}
}

export interface MsSqlBinaryConfig {
	length?: number;
}

export function binary<TName extends string>(
	name: TName,
	config: MsSqlBinaryConfig = {},
): MsSqlBinaryBuilderInitial<TName> {
	return new MsSqlBinaryBuilder(name, config.length);
}
