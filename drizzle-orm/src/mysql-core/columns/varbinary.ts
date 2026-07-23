import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlVarBinaryBuilderInitial<TName extends string> = MySqlVarBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlVarBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlVarBinaryBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlVarBinary'>>
	extends MySqlColumnBuilder<T, MySqlVarbinaryOptions>
{
	static override readonly [entityKind]: string = 'MySqlVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: MySqlVarbinaryOptions) {
		super(name, 'string', 'MySqlVarBinary');
		this.config.length = config?.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlVarBinary<MakeColumnConfig<T, TTableName>> {
		return new MySqlVarBinary<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlVarBinary<
	T extends ColumnBaseConfig<'string', 'MySqlVarBinary'>,
> extends MySqlColumn<T, MySqlVarbinaryOptions> {
	static override readonly [entityKind]: string = 'MySqlVarBinary';

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

export type MySqlVarBinaryBufferBuilderInitial<TName extends string> = MySqlVarBinaryBufferBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MySqlVarBinaryBuffer';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class MySqlVarBinaryBufferBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'MySqlVarBinaryBuffer'>>
	extends MySqlColumnBuilder<T, MySqlVarbinaryOptions>
{
	static override readonly [entityKind]: string = 'MySqlVarBinaryBufferBuilder';

	/** @internal */
	constructor(name: T['name'], config: MySqlVarbinaryOptions) {
		super(name, 'buffer', 'MySqlVarBinaryBuffer');
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

export class MySqlVarBinaryBuffer<
	T extends ColumnBaseConfig<'buffer', 'MySqlVarBinaryBuffer'>,
> extends MySqlColumn<T, MySqlVarbinaryOptions> {
	static override readonly [entityKind]: string = 'MySqlVarBinaryBuffer';

	length: number | undefined = this.config.length;

	override mapFromDriverValue(value: string | Buffer | Uint8Array): Buffer {
		if (Buffer.isBuffer(value)) return value;
		if (typeof value === 'string') return Buffer.from(value, 'binary');
		return Buffer.from(value);
	}

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface MySqlVarbinaryOptions<TMode extends 'string' | 'buffer' = 'string' | 'buffer'> {
	length: number;
	mode?: TMode;
}

export function varbinary<TMode extends 'string' | 'buffer' = 'string'>(
	config: MySqlVarbinaryOptions<TMode>,
): Equal<TMode, 'buffer'> extends true ? MySqlVarBinaryBufferBuilderInitial<''> : MySqlVarBinaryBuilderInitial<''>;
export function varbinary<TName extends string, TMode extends 'string' | 'buffer' = 'string'>(
	name: TName,
	config: MySqlVarbinaryOptions<TMode>,
): Equal<TMode, 'buffer'> extends true ? MySqlVarBinaryBufferBuilderInitial<TName> : MySqlVarBinaryBuilderInitial<TName>;
export function varbinary(a?: string | MySqlVarbinaryOptions, b?: MySqlVarbinaryOptions) {
	const { name, config } = getColumnNameAndConfig<MySqlVarbinaryOptions>(a, b);
	if (config.mode === 'buffer') {
		return new MySqlVarBinaryBufferBuilder(name, config);
	}
	return new MySqlVarBinaryBuilder(name, config);
}
