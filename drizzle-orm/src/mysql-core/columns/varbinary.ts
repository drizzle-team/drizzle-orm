import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

type VarBinaryMode = 'buffer' | 'string';

// ---------- Buffer variant ----------

export type MySqlVarBinaryBufferBuilderInitial<TName extends string> = MySqlVarBinaryBufferBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MySqlVarBinary';
	data: Buffer;
	driverParam: Buffer | string;
	enumValues: undefined;
}>;

export class MySqlVarBinaryBufferBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'MySqlVarBinary'>>
	extends MySqlColumnBuilder<T, MySqlVarbinaryOptions>
{
	static override readonly [entityKind]: string = 'MySqlVarBinaryBufferBuilder';

	/** @internal */
	constructor(name: T['name'], config: MySqlVarbinaryOptions) {
		super(name, 'buffer', 'MySqlVarBinary');
		this.config.length = config?.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlVarBinaryBuffer<MakeColumnConfig<T, TTableName>> {
		return new MySqlVarBinaryBuffer<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlVarBinaryBuffer<T extends ColumnBaseConfig<'buffer', 'MySqlVarBinary'>>
	extends MySqlColumn<T, MySqlVarbinaryOptions>
{
	static override readonly [entityKind]: string = 'MySqlVarBinaryBuffer';

	length: number | undefined = this.config.length;

	override mapFromDriverValue(value: Buffer | Uint8Array | string): Buffer {
		if (Buffer.isBuffer(value)) return value;
		return Buffer.from(value as Uint8Array | string);
	}

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

// ---------- String variant (legacy) ----------

export type MySqlVarBinaryStringBuilderInitial<TName extends string> = MySqlVarBinaryStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlVarBinary';
	data: string;
	driverParam: string | Buffer;
	enumValues: undefined;
}>;

export class MySqlVarBinaryStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlVarBinary'>>
	extends MySqlColumnBuilder<T, MySqlVarbinaryOptions>
{
	static override readonly [entityKind]: string = 'MySqlVarBinaryStringBuilder';

	/** @internal */
	constructor(name: T['name'], config: MySqlVarbinaryOptions) {
		super(name, 'string', 'MySqlVarBinary');
		this.config.length = config?.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlVarBinaryString<MakeColumnConfig<T, TTableName>> {
		return new MySqlVarBinaryString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlVarBinaryString<T extends ColumnBaseConfig<'string', 'MySqlVarBinary'>>
	extends MySqlColumn<T, MySqlVarbinaryOptions>
{
	static override readonly [entityKind]: string = 'MySqlVarBinaryString';

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
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

// ---------- Config + factory ----------

export interface MySqlVarbinaryOptions<TMode extends VarBinaryMode = VarBinaryMode> {
	length: number;
	mode?: TMode;
}

export function varbinary<TMode extends VarBinaryMode = VarBinaryMode>(
	config: MySqlVarbinaryOptions<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlVarBinaryStringBuilderInitial<''>
	: MySqlVarBinaryBufferBuilderInitial<''>;
export function varbinary<TName extends string, TMode extends VarBinaryMode = VarBinaryMode>(
	name: TName,
	config: MySqlVarbinaryOptions<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlVarBinaryStringBuilderInitial<TName>
	: MySqlVarBinaryBufferBuilderInitial<TName>;
export function varbinary(a?: string | MySqlVarbinaryOptions, b?: MySqlVarbinaryOptions) {
	const { name, config } = getColumnNameAndConfig<MySqlVarbinaryOptions>(a, b);
	if (config?.mode === 'string') {
		return new MySqlVarBinaryStringBuilder(name, config);
	}
	return new MySqlVarBinaryBufferBuilder(name, config);
}
