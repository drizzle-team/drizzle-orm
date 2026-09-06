import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type BinaryMode = 'buffer' | 'string';

export type SingleStoreBinaryBufferBuilderInitial<TName extends string> = SingleStoreBinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'SingleStoreBinary';
	data: Buffer;
	driverParam: Buffer | string;
	enumValues: undefined;
}>;

export type SingleStoreBinaryStringBuilderInitial<TName extends string> = SingleStoreBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class SingleStoreBinaryBuilder<
	T extends ColumnBuilderBaseConfig<'buffer' | 'string', 'SingleStoreBinary'>,
> extends SingleStoreColumnBuilder<T, SingleStoreBinaryConfig> {
	static override readonly [entityKind]: string = 'SingleStoreBinaryBuilder';

	constructor(name: T['name'], length: number | undefined, mode: BinaryMode) {
		super(name, mode === 'string' ? 'string' : 'buffer', 'SingleStoreBinary');
		this.config.length = length;
		this.config.mode = mode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBinary<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBinary<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SingleStoreBinary<T extends ColumnBaseConfig<'buffer' | 'string', 'SingleStoreBinary'>> extends SingleStoreColumn<
	T,
	SingleStoreBinaryConfig
> {
	static override readonly [entityKind]: string = 'SingleStoreBinary';

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

export interface SingleStoreBinaryConfig<TMode extends BinaryMode = BinaryMode> {
	length?: number;
	/**
	 * - `'buffer'` (default): matches mysql2 — select type is `Buffer`, bytes preserved.
	 * - `'string'`: legacy behaviour / PlanetScale-friendly string mapping.
	 */
	mode?: TMode;
}

export function binary(): SingleStoreBinaryBufferBuilderInitial<''>;
export function binary<TMode extends BinaryMode>(
	config?: SingleStoreBinaryConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreBinaryStringBuilderInitial<''> : SingleStoreBinaryBufferBuilderInitial<''>;
export function binary<TName extends string, TMode extends BinaryMode>(
	name: TName,
	config?: SingleStoreBinaryConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreBinaryStringBuilderInitial<TName> : SingleStoreBinaryBufferBuilderInitial<TName>;
export function binary(a?: string | SingleStoreBinaryConfig, b: SingleStoreBinaryConfig = {}) {
	const { name, config } = getColumnNameAndConfig<SingleStoreBinaryConfig>(a, b);
	const mode = config.mode ?? 'buffer';
	return new SingleStoreBinaryBuilder(name, config.length, mode);
}
