import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';
import { getColumnNameAndConfig } from '~/utils.ts';

export type MySqlBinaryBuilderInitial<TName extends string> = MySqlBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class MySqlBinaryBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlBinary'>> extends MySqlColumnBuilder<
	T,
	MySqlBinaryConfig
> {
	static readonly [entityKind]: string = 'MySqlBinaryBuilder';

	constructor(name: string, length: number | undefined) {
		super(name, 'string', 'MySqlBinary');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBinary<MakeColumnConfig<T, TTableName>> {
		return new MySqlBinary<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlBinary<T extends ColumnBaseConfig<'string', 'MySqlBinary'>> extends MySqlColumn<
	T,
	MySqlBinaryConfig
> {
	static readonly [entityKind]: string = 'MySqlBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `binary` : `binary(${this.length})`;
	}
}

export interface MySqlBinaryConfig {
	length?: number;
}

export function binary(): MySqlBinaryBuilderInitial<''>;
export function binary(
	config?: MySqlBinaryConfig,
): MySqlBinaryBuilderInitial<''>;
export function binary<TName extends string>(
	name: TName,
	config?: MySqlBinaryConfig,
): MySqlBinaryBuilderInitial<TName>;
export function binary<TName extends string>(
	a?: TName | MySqlBinaryConfig,
	b: MySqlBinaryConfig = {},
): MySqlBinaryBuilderInitial<TName> {
	const { name, config } = getColumnNameAndConfig<TName, MySqlBinaryConfig>(a, b);
	return new MySqlBinaryBuilder(name, config.length);
}
