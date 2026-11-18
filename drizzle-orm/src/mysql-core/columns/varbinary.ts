import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type VarbinaryMode = 'buffer' | 'string';

export type MySqlVarBinaryBufferBuilderInitial<TName extends string> = MySqlVarBinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MySqlVarBinary';
	data: Buffer;
	driverParam: Buffer | string;
	enumValues: undefined;
}>;

export type MySqlVarBinaryStringBuilderInitial<TName extends string> = MySqlVarBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlVarBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlVarBinaryBuilder<
	T extends ColumnBuilderBaseConfig<'buffer' | 'string', 'MySqlVarBinary'>,
> extends MySqlColumnBuilder<T, MySqlVarbinaryOptions> {
	static override readonly [entityKind]: string = 'MySqlVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: MySqlVarbinaryOptions) {
		const mode = config.mode ?? 'buffer';
		super(name, mode === 'string' ? 'string' : 'buffer', 'MySqlVarBinary');
		this.config.length = config?.length;
		this.config.mode = mode;
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
	T extends ColumnBaseConfig<'buffer' | 'string', 'MySqlVarBinary'>,
> extends MySqlColumn<T, MySqlVarbinaryOptions> {
	static override readonly [entityKind]: string = 'MySqlVarBinary';

	length: number | undefined = this.config.length;
	mode: VarbinaryMode = this.config.mode ?? 'buffer';

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

		if (Buffer.isBuffer(value)) return value as T['data'];
		if (typeof value === 'string') return Buffer.from(value, 'binary') as T['data'];
		return Buffer.from(value) as T['data'];
	}

	override mapToDriverValue(value: T['data']): Buffer | string {
		if (typeof value === 'string') return value;
		return value as Buffer;
	}

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface MySqlVarbinaryOptions<TMode extends VarbinaryMode = VarbinaryMode> {
	length: number;
	/**
	 * - `'buffer'` (default): matches mysql2 — select type is `Buffer`, bytes preserved.
	 * - `'string'`: legacy behaviour / PlanetScale-friendly string mapping.
	 */
	mode?: TMode;
}

export function varbinary<TMode extends VarbinaryMode>(
	config: MySqlVarbinaryOptions<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlVarBinaryStringBuilderInitial<''> : MySqlVarBinaryBufferBuilderInitial<''>;
export function varbinary<TName extends string, TMode extends VarbinaryMode>(
	name: TName,
	config: MySqlVarbinaryOptions<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlVarBinaryStringBuilderInitial<TName>
	: MySqlVarBinaryBufferBuilderInitial<TName>;
export function varbinary(a?: string | MySqlVarbinaryOptions, b?: MySqlVarbinaryOptions) {
	const { name, config } = getColumnNameAndConfig<MySqlVarbinaryOptions>(a, b);
	return new MySqlVarBinaryBuilder(name, config);
}
