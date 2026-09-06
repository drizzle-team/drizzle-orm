import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type BinaryMode = 'buffer' | 'string';

export type MySqlBinaryBufferBuilderInitial<TName extends string> = MySqlBinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MySqlBinary';
	data: Buffer;
	driverParam: Buffer | string;
	enumValues: undefined;
}>;

export type MySqlBinaryStringBuilderInitial<TName extends string> = MySqlBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlBinaryBuilder<
	T extends ColumnBuilderBaseConfig<'buffer' | 'string', 'MySqlBinary'>,
> extends MySqlColumnBuilder<T, MySqlBinaryConfig> {
	static override readonly [entityKind]: string = 'MySqlBinaryBuilder';

	constructor(name: T['name'], length: number | undefined, mode: BinaryMode) {
		super(name, mode === 'string' ? 'string' : 'buffer', 'MySqlBinary');
		this.config.length = length;
		this.config.mode = mode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlBinary<MakeColumnConfig<T, TTableName>> {
		return new MySqlBinary<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlBinary<T extends ColumnBaseConfig<'buffer' | 'string', 'MySqlBinary'>> extends MySqlColumn<
	T,
	MySqlBinaryConfig
> {
	static override readonly [entityKind]: string = 'MySqlBinary';

	length: number | undefined = this.config.length;
	mode: BinaryMode = this.config.mode ?? 'buffer';

	override mapFromDriverValue(value: string | Buffer | Uint8Array): T['data'] {
		if (this.mode === 'string') {
			if (typeof value === 'string') return value as T['data'];
			if (Buffer.isBuffer(value)) return value.toString() as T['data'];

			const str: string[] = [];
			for (const v of value) {
				str.push(v === 49 ? '1' : '0');
			}
			return str.join('') as T['data'];
		}

		// buffer mode (default): preserve bytes. PlanetScale may hand us a string.
		if (Buffer.isBuffer(value)) return value as T['data'];
		if (typeof value === 'string') return Buffer.from(value, 'binary') as T['data'];
		return Buffer.from(value) as T['data'];
	}

	override mapToDriverValue(value: T['data']): Buffer | string {
		if (typeof value === 'string') return value;
		return value as Buffer;
	}

	getSQLType(): string {
		return this.length === undefined ? `binary` : `binary(${this.length})`;
	}
}

export interface MySqlBinaryConfig<TMode extends BinaryMode = BinaryMode> {
	length?: number;
	/**
	 * - `'buffer'` (default): matches mysql2 — select type is `Buffer`, bytes preserved.
	 * - `'string'`: legacy behaviour / PlanetScale-friendly string mapping.
	 */
	mode?: TMode;
}

export function binary(): MySqlBinaryBufferBuilderInitial<''>;
export function binary<TMode extends BinaryMode>(
	config?: MySqlBinaryConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlBinaryStringBuilderInitial<''> : MySqlBinaryBufferBuilderInitial<''>;
export function binary<TName extends string, TMode extends BinaryMode>(
	name: TName,
	config?: MySqlBinaryConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlBinaryStringBuilderInitial<TName> : MySqlBinaryBufferBuilderInitial<TName>;
export function binary(a?: string | MySqlBinaryConfig, b: MySqlBinaryConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlBinaryConfig>(a, b);
	const mode = config.mode ?? 'buffer';
	return new MySqlBinaryBuilder(name, config.length, mode);
}
