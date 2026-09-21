import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type VarbinaryMode = 'buffer' | 'string';

export type SingleStoreVarBinaryBufferBuilderInitial<TName extends string> = SingleStoreVarBinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'SingleStoreVarBinary';
	data: Buffer;
	driverParam: Buffer | string;
	enumValues: undefined;
}>;

export type SingleStoreVarBinaryStringBuilderInitial<TName extends string> = SingleStoreVarBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreVarBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class SingleStoreVarBinaryBuilder<
	T extends ColumnBuilderBaseConfig<'buffer' | 'string', 'SingleStoreVarBinary'>,
> extends SingleStoreColumnBuilder<T, SingleStoreVarbinaryOptions> {
	static override readonly [entityKind]: string = 'SingleStoreVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: SingleStoreVarbinaryOptions) {
		const mode = config.mode ?? 'buffer';
		super(name, mode === 'string' ? 'string' : 'buffer', 'SingleStoreVarBinary');
		this.config.length = config?.length;
		this.config.mode = mode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreVarBinary<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreVarBinary<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreVarBinary<
	T extends ColumnBaseConfig<'buffer' | 'string', 'SingleStoreVarBinary'>,
> extends SingleStoreColumn<T, SingleStoreVarbinaryOptions> {
	static override readonly [entityKind]: string = 'SingleStoreVarBinary';

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

export interface SingleStoreVarbinaryOptions<TMode extends VarbinaryMode = VarbinaryMode> {
	length: number;
	/**
	 * - `'buffer'` (default): matches mysql2 — select type is `Buffer`, bytes preserved.
	 * - `'string'`: legacy behaviour / PlanetScale-friendly string mapping.
	 */
	mode?: TMode;
}

export function varbinary<TMode extends VarbinaryMode>(
	config: SingleStoreVarbinaryOptions<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreVarBinaryStringBuilderInitial<''> : SingleStoreVarBinaryBufferBuilderInitial<''>;
export function varbinary<TName extends string, TMode extends VarbinaryMode>(
	name: TName,
	config: SingleStoreVarbinaryOptions<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreVarBinaryStringBuilderInitial<TName>
	: SingleStoreVarBinaryBufferBuilderInitial<TName>;
export function varbinary(a?: string | SingleStoreVarbinaryOptions, b?: SingleStoreVarbinaryOptions) {
	const { name, config } = getColumnNameAndConfig<SingleStoreVarbinaryOptions>(a, b);
	return new SingleStoreVarBinaryBuilder(name, config);
}
