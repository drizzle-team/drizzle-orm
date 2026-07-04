import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlBinaryBuilderInitial<TName extends string> = MySqlBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlBinaryBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlBinary'>> extends MySqlColumnBuilder<
	T,
	MySqlBinaryConfig
> {
	static override readonly [entityKind]: string = 'MySqlBinaryBuilder';

	constructor(name: T['name'], length: number | undefined) {
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
	static override readonly [entityKind]: string = 'MySqlBinary';

	length: number | undefined = this.config.length;

	override mapFromDriverValue(value: string | Buffer | Uint8Array): string {
		if (typeof value === 'string') return value;
		if (Buffer.isBuffer(value)) return value.toString();

		const str: string[] = [];
		for (const v of value) {
			str.push(v === 49 ? '1' : '0');
		}

		return str.join('');
	}

	getSQLType(): string {
		return this.length === undefined ? `binary` : `binary(${this.length})`;
	}
}

export type MySqlBinaryBufferBuilderInitial<TName extends string> = MySqlBinaryBufferBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MySqlBinaryBuffer';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class MySqlBinaryBufferBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'MySqlBinaryBuffer'>>
	extends MySqlColumnBuilder<T, MySqlBinaryConfig>
{
	static override readonly [entityKind]: string = 'MySqlBinaryBufferBuilder';

	constructor(name: T['name'], length: number | undefined) {
		super(name, 'buffer', 'MySqlBinaryBuffer');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBinaryBuffer<MakeColumnConfig<T, TTableName>> {
		return new MySqlBinaryBuffer<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlBinaryBuffer<T extends ColumnBaseConfig<'buffer', 'MySqlBinaryBuffer'>> extends MySqlColumn<
	T,
	MySqlBinaryConfig
> {
	static override readonly [entityKind]: string = 'MySqlBinaryBuffer';

	length: number | undefined = this.config.length;

	override mapFromDriverValue(value: string | Buffer | Uint8Array): Buffer {
		if (Buffer.isBuffer(value)) return value;
		if (typeof value === 'string') return Buffer.from(value, 'binary');
		return Buffer.from(value);
	}

	getSQLType(): string {
		return this.length === undefined ? `binary` : `binary(${this.length})`;
	}
}

export interface MySqlBinaryConfig<TMode extends 'string' | 'buffer' = 'string' | 'buffer'> {
	length?: number;
	mode?: TMode;
}

export function binary(): MySqlBinaryBuilderInitial<''>;
export function binary<TMode extends 'string' | 'buffer' = 'string'>(
	config?: MySqlBinaryConfig<TMode>,
): Equal<TMode, 'buffer'> extends true ? MySqlBinaryBufferBuilderInitial<''> : MySqlBinaryBuilderInitial<''>;
export function binary<TName extends string, TMode extends 'string' | 'buffer' = 'string'>(
	name: TName,
	config?: MySqlBinaryConfig<TMode>,
): Equal<TMode, 'buffer'> extends true ? MySqlBinaryBufferBuilderInitial<TName> : MySqlBinaryBuilderInitial<TName>;
export function binary(a?: string | MySqlBinaryConfig, b: MySqlBinaryConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlBinaryConfig>(a, b);
	if (config.mode === 'buffer') {
		return new MySqlBinaryBufferBuilder(name, config.length);
	}
	return new MySqlBinaryBuilder(name, config.length);
}
