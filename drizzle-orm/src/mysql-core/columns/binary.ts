import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

type BinaryMode = 'buffer' | 'string';

// ---------- Buffer variant ----------

export type MySqlBinaryBufferBuilderInitial<TName extends string> = MySqlBinaryBufferBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MySqlBinary';
	data: Buffer;
	driverParam: Buffer | string;
	enumValues: undefined;
}>;

export class MySqlBinaryBufferBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'MySqlBinary'>>
	extends MySqlColumnBuilder<T, MySqlBinaryConfig>
{
	static override readonly [entityKind]: string = 'MySqlBinaryBufferBuilder';

	constructor(name: T['name'], length: number | undefined) {
		super(name, 'buffer', 'MySqlBinary');
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

export class MySqlBinaryBuffer<T extends ColumnBaseConfig<'buffer', 'MySqlBinary'>>
	extends MySqlColumn<T, MySqlBinaryConfig>
{
	static override readonly [entityKind]: string = 'MySqlBinaryBuffer';

	length: number | undefined = this.config.length;

	override mapFromDriverValue(value: Buffer | Uint8Array | string): Buffer {
		if (Buffer.isBuffer(value)) return value;
		return Buffer.from(value as Uint8Array | string);
	}

	getSQLType(): string {
		return this.length === undefined ? `binary` : `binary(${this.length})`;
	}
}

// ---------- String variant (legacy) ----------

export type MySqlBinaryStringBuilderInitial<TName extends string> = MySqlBinaryStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlBinary';
	data: string;
	driverParam: string | Buffer;
	enumValues: undefined;
}>;

export class MySqlBinaryStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlBinary'>>
	extends MySqlColumnBuilder<T, MySqlBinaryConfig>
{
	static override readonly [entityKind]: string = 'MySqlBinaryStringBuilder';

	constructor(name: T['name'], length: number | undefined) {
		super(name, 'string', 'MySqlBinary');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBinaryString<MakeColumnConfig<T, TTableName>> {
		return new MySqlBinaryString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlBinaryString<T extends ColumnBaseConfig<'string', 'MySqlBinary'>>
	extends MySqlColumn<T, MySqlBinaryConfig>
{
	static override readonly [entityKind]: string = 'MySqlBinaryString';

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

// ---------- Config + factory ----------

export interface MySqlBinaryConfig<TMode extends BinaryMode = BinaryMode> {
	length?: number;
	mode?: TMode;
}

export function binary(): MySqlBinaryBufferBuilderInitial<''>;
export function binary<TMode extends BinaryMode = BinaryMode>(
	config?: MySqlBinaryConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlBinaryStringBuilderInitial<''>
	: MySqlBinaryBufferBuilderInitial<''>;
export function binary<TName extends string, TMode extends BinaryMode = BinaryMode>(
	name: TName,
	config?: MySqlBinaryConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlBinaryStringBuilderInitial<TName>
	: MySqlBinaryBufferBuilderInitial<TName>;
export function binary(a?: string | MySqlBinaryConfig, b: MySqlBinaryConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlBinaryConfig>(a, b);
	if (config?.mode === 'string') {
		return new MySqlBinaryStringBuilder(name, config.length);
	}
	return new MySqlBinaryBufferBuilder(name, config.length);
}
