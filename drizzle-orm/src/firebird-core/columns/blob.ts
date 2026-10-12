import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { type Equal, getColumnNameAndConfig, textDecoder } from '~/utils.ts';
import { FirebirdColumn, FirebirdColumnBuilder } from './common.ts';

type BlobMode = 'buffer' | 'json' | 'bigint';

export type FirebirdBigIntBuilderInitial<TName extends string> = FirebirdBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'FirebirdBigInt';
	data: bigint;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class FirebirdBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint', 'FirebirdBigInt'>>
	extends FirebirdColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdBigIntBuilder';

	constructor(name: T['name']) {
		super(name, 'bigint', 'FirebirdBigInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdBigInt<MakeColumnConfig<T, TTableName>> {
		return new FirebirdBigInt<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any>);
	}
}

export class FirebirdBigInt<T extends ColumnBaseConfig<'bigint', 'FirebirdBigInt'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdBigInt';

	getSQLType(): string {
		return 'blob sub_type text';
	}

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer): bigint {
		if (typeof Buffer !== 'undefined' && Buffer.from) {
			const buf = Buffer.isBuffer(value)
				? value
				// eslint-disable-next-line no-instanceof/no-instanceof
				: value instanceof ArrayBuffer
				? Buffer.from(value)
				: value.buffer
				? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
				: Buffer.from(value);
			return BigInt(buf.toString('utf8'));
		}

		return BigInt(textDecoder!.decode(value));
	}

	override mapToDriverValue(value: bigint): Buffer {
		return Buffer.from(value.toString());
	}
}

export type FirebirdBlobJsonBuilderInitial<TName extends string> = FirebirdBlobJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'FirebirdBlobJson';
	data: unknown;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class FirebirdBlobJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'FirebirdBlobJson'>>
	extends FirebirdColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdBlobJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'FirebirdBlobJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdBlobJson<MakeColumnConfig<T, TTableName>> {
		return new FirebirdBlobJson<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any>,
		);
	}
}

export class FirebirdBlobJson<T extends ColumnBaseConfig<'json', 'FirebirdBlobJson'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdBlobJson';

	getSQLType(): string {
		return 'blob sub_type text';
	}

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer): T['data'] {
		if (typeof Buffer !== 'undefined' && Buffer.from) {
			const buf = Buffer.isBuffer(value)
				? value
				// eslint-disable-next-line no-instanceof/no-instanceof
				: value instanceof ArrayBuffer
				? Buffer.from(value)
				: value.buffer
				? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
				: Buffer.from(value);
			return JSON.parse(buf.toString('utf8'));
		}

		return JSON.parse(textDecoder!.decode(value));
	}

	override mapToDriverValue(value: T['data']): Buffer {
		return Buffer.from(JSON.stringify(value));
	}
}

export type FirebirdBlobBufferBuilderInitial<TName extends string> = FirebirdBlobBufferBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'FirebirdBlobBuffer';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class FirebirdBlobBufferBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'FirebirdBlobBuffer'>>
	extends FirebirdColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdBlobBufferBuilder';

	constructor(name: T['name']) {
		super(name, 'buffer', 'FirebirdBlobBuffer');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdBlobBuffer<MakeColumnConfig<T, TTableName>> {
		return new FirebirdBlobBuffer<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any>,
		);
	}
}

export class FirebirdBlobBuffer<T extends ColumnBaseConfig<'buffer', 'FirebirdBlobBuffer'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdBlobBuffer';

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer): T['data'] {
		if (Buffer.isBuffer(value)) {
			return value;
		}

		return Buffer.from(value as Uint8Array);
	}

	getSQLType(): string {
		return 'blob sub_type binary';
	}
}

export interface BlobConfig<TMode extends BlobMode = BlobMode> {
	mode: TMode;
}

/**
 *  It's recommended to use `text('...', { mode: 'json' })` instead of `blob` in JSON mode, because it supports JSON functions:
 * >All JSON functions currently throw an error if any of their arguments are BLOBs because BLOBs are reserved for a future enhancement in which BLOBs will store the binary encoding for JSON.
 *
 * https://www.firebird.org/json1.html
 */
export function blob(): FirebirdBlobJsonBuilderInitial<''>;
export function blob<TMode extends BlobMode = BlobMode>(
	config?: BlobConfig<TMode>,
): Equal<TMode, 'bigint'> extends true ? FirebirdBigIntBuilderInitial<''>
	: Equal<TMode, 'buffer'> extends true ? FirebirdBlobBufferBuilderInitial<''>
	: FirebirdBlobJsonBuilderInitial<''>;
export function blob<TName extends string, TMode extends BlobMode = BlobMode>(
	name: TName,
	config?: BlobConfig<TMode>,
): Equal<TMode, 'bigint'> extends true ? FirebirdBigIntBuilderInitial<TName>
	: Equal<TMode, 'buffer'> extends true ? FirebirdBlobBufferBuilderInitial<TName>
	: FirebirdBlobJsonBuilderInitial<TName>;
export function blob(a?: string | BlobConfig, b?: BlobConfig) {
	const { name, config } = getColumnNameAndConfig<BlobConfig | undefined>(a, b);
	if (config?.mode === 'json') {
		return new FirebirdBlobJsonBuilder(name);
	}
	if (config?.mode === 'bigint') {
		return new FirebirdBigIntBuilder(name);
	}
	return new FirebirdBlobBufferBuilder(name);
}
