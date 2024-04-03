import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlBinaryBuilderInitial<TName extends string> = MySqlBinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MySqlBinary';
	data: Buffer | string;
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlBinaryBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'MySqlBinary'>> extends MySqlColumnBuilder<
	T,
	MySqlBinaryConfig
> {
	static readonly [entityKind]: string = 'MySqlBinaryBuilder';

	constructor(name: T['name'], length: number | undefined) {
		super(name, 'buffer', 'MySqlBinary');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBinary<MakeColumnConfig<T, TTableName>> {
		return new MySqlBinary<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlBinary<T extends ColumnBaseConfig<'buffer', 'MySqlBinary'>> extends MySqlColumn<
	T,
	MySqlBinaryConfig
> {
	static readonly [entityKind]: string = 'MySqlBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `binary` : `binary(${this.length})`;
	}

	override mapFromDriverValue(value: Buffer | string): Buffer {
		if (typeof value === 'string') {
			return Buffer.from(value);
		}

		return value;
	}

	override mapToDriverValue(value: Buffer | string): string {
		// enforcing toString here because PlanetScale needs it to be a string
		return value.toString();
	}
}

export interface MySqlBinaryConfig {
	length?: number;
}

export function binary<TName extends string>(
	name: TName,
	config: MySqlBinaryConfig = {},
): MySqlBinaryBuilderInitial<TName> {
	return new MySqlBinaryBuilder(name, config.length);
}
