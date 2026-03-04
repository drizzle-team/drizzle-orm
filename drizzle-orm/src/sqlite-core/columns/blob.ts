import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { type Equal, getColumnNameAndConfig, textDecoder } from '~/utils.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

type BlobMode = 'buffer' | 'json' | 'bigint';

function hexToText(hexString: string) {
	let result = '';
	for (let i = 0; i < hexString.length; i += 2) {
		const hexPair = hexString.slice(i, i + 2);
		const decimalValue = Number.parseInt(hexPair, 16);
		result += String.fromCodePoint(decimalValue);
	}
	return result;
}

export class SQLiteBigIntBuilder extends SQLiteColumnBuilder<{
	dataType: 'bigint int64';
	data: bigint;
	driverParam: Buffer;
}> {
	static override readonly [entityKind]: string = 'SQLiteBigIntBuilder';

	constructor(name: string) {
		super(name, 'bigint int64', 'SQLiteBigInt');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteBigInt(table, this.config as any);
	}
}

export class SQLiteBigInt<T extends ColumnBaseConfig<'bigint int64'>> extends SQLiteColumn<T> {
	static override readonly [entityKind]: string = 'SQLiteBigInt';

	getSQLType(): string {
		return 'blob';
	}

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer | string): bigint {
		// For RQBv2
		if (typeof value === 'string') {
			return BigInt(hexToText(value));
		}

		if (typeof Buffer !== 'undefined' && Buffer.from) {
			const buf = Buffer.isBuffer(value)
				? value
				// oxlint-disable-next-line drizzle-internal/no-instanceof
				: value instanceof ArrayBuffer
				? Buffer.from(value)
				: value.buffer
				? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
				: Buffer.from(value);
			return BigInt(buf.toString('utf8'));
		}

		return BigInt(textDecoder!.decode(value as ArrayBuffer));
	}

	override mapToDriverValue(value: bigint): Buffer {
		return Buffer.from(value.toString());
	}
}

export class SQLiteBlobJsonBuilder extends SQLiteColumnBuilder<{
	dataType: 'object json';
	data: unknown;
	driverParam: Buffer;
}> {
	static override readonly [entityKind]: string = 'SQLiteBlobJsonBuilder';

	constructor(name: string) {
		super(name, 'object json', 'SQLiteBlobJson');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteBlobJson(
			table,
			this.config as any,
		);
	}
}

export class SQLiteBlobJson<T extends ColumnBaseConfig<'object json'>> extends SQLiteColumn<T> {
	static override readonly [entityKind]: string = 'SQLiteBlobJson';

	getSQLType(): string {
		return 'blob';
	}

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer | string): T['data'] {
		// For RQBv2
		if (typeof value === 'string') {
			return JSON.parse(hexToText(value));
		}

		if (typeof Buffer !== 'undefined' && Buffer.from) {
			const buf = Buffer.isBuffer(value)
				? value
				// oxlint-disable-next-line drizzle-internal/no-instanceof
				: value instanceof ArrayBuffer
				? Buffer.from(value)
				: value.buffer
				? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
				: Buffer.from(value);
			return JSON.parse(buf.toString('utf8'));
		}

		return JSON.parse(textDecoder!.decode(value as ArrayBuffer));
	}

	override mapToDriverValue(value: T['data']): Buffer {
		return Buffer.from(JSON.stringify(value));
	}
}

export class SQLiteBlobBufferBuilder extends SQLiteColumnBuilder<{
	dataType: 'object buffer';
	data: Buffer;
	driverParam: Buffer;
}> {
	static override readonly [entityKind]: string = 'SQLiteBlobBufferBuilder';

	constructor(name: string) {
		super(name, 'object buffer', 'SQLiteBlobBuffer');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteBlobBuffer(table, this.config as any);
	}
}

export class SQLiteBlobBuffer<T extends ColumnBaseConfig<'object buffer'>> extends SQLiteColumn<T> {
	static override readonly [entityKind]: string = 'SQLiteBlobBuffer';

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer): T['data'] {
		if (Buffer.isBuffer(value)) {
			return value;
		}

		// For RQBv2
		if (typeof value === 'string') {
			return Buffer.from(value, 'hex');
		}

		return Buffer.from(value as Uint8Array);
	}

	getSQLType(): string {
		return 'blob';
	}
}

export interface BlobConfig<TMode extends BlobMode = BlobMode> {
	mode: TMode;
}

/**
 *  It's recommended to use `text('...', { mode: 'json' })` instead of `blob` in JSON mode, because it supports JSON functions:
 * >All JSON functions currently throw an error if any of their arguments are BLOBs because BLOBs are reserved for a future enhancement in which BLOBs will store the binary encoding for JSON.
 *
 * https://www.sqlite.org/json1.html
 */
export function blob<TMode extends BlobMode = BlobMode>(
	config?: BlobConfig<TMode>,
): Equal<TMode, 'bigint'> extends true ? SQLiteBigIntBuilder
	: Equal<TMode, 'buffer'> extends true ? SQLiteBlobBufferBuilder
	: SQLiteBlobJsonBuilder;
export function blob<TMode extends BlobMode = BlobMode>(
	name: string,
	config?: BlobConfig<TMode>,
): Equal<TMode, 'bigint'> extends true ? SQLiteBigIntBuilder
	: Equal<TMode, 'buffer'> extends true ? SQLiteBlobBufferBuilder
	: SQLiteBlobJsonBuilder;
export function blob(a?: string | BlobConfig, b?: BlobConfig) {
	const { name, config } = getColumnNameAndConfig<BlobConfig | undefined>(a, b);
	if (config?.mode === 'json') {
		return new SQLiteBlobJsonBuilder(name);
	}
	if (config?.mode === 'bigint') {
		return new SQLiteBigIntBuilder(name);
	}
	return new SQLiteBlobBufferBuilder(name);
}
