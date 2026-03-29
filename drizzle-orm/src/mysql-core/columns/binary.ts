import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlBinaryBuilderInitial<TName extends string> = MySqlBinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MySqlBinary';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class MySqlBinaryBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'MySqlBinary'>> extends MySqlColumnBuilder<
	T,
	MySqlBinaryConfig
> {
	static override readonly [entityKind]: string = 'MySqlBinaryBuilder';

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
	static override readonly [entityKind]: string = 'MySqlBinary';

	length: number | undefined = this.config.length;

	override mapFromDriverValue(value: string | Buffer | Uint8Array): Buffer {
		if (Buffer.isBuffer(value)) return value;
		if (typeof value === 'string') return Buffer.from(value, 'hex');
		if (value instanceof Uint8Array) return Buffer.from(value);

		const str: string[] = [];
		for (const v of value) {
			str.push(v === 49 ? '1' : '0');
		}

		return Buffer.from(str.join(''), 'binary');
	}

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
export function binary(a?: string | MySqlBinaryConfig, b: MySqlBinaryConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlBinaryConfig>(a, b);
	return new MySqlBinaryBuilder(name, config.length);
}