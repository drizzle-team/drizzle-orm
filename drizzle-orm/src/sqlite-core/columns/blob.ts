import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

type BlobMode = 'buffer' | 'json' | 'bigint';

export type SQLiteBigIntBuilderInitial<TName extends string> = SQLiteBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	data: bigint;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class SQLiteBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint'>>
	extends SQLiteColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SQLiteBigIntBuilder';

	constructor(name: T['name']) {
		super(name, 'bigint', 'SQLiteBigInt');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteBigInt(table, this.config as any);
	}
}

export class SQLiteBigInt<T extends ColumnBaseConfig<'bigint'>> extends SQLiteColumn<T> {
	static override readonly [entityKind]: string = 'SQLiteBigInt';

	getSQLType(): string {
		return 'blob';
	}

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer | string): bigint {
		if (Buffer.isBuffer(value)) {
			return BigInt(value.toString());
		}

		// For RQBv2
		if (typeof value === 'string') {
			return BigInt(Buffer.from(value, 'hex').toString());
		}

		// for sqlite durable objects
		// eslint-disable-next-line no-instanceof/no-instanceof
		if (value instanceof ArrayBuffer) {
			const decoder = new TextDecoder();
			return BigInt(decoder.decode(value));
		}

		return BigInt(String.fromCodePoint(...value));
	}

	override mapToDriverValue(value: bigint): Buffer {
		return Buffer.from(value.toString());
	}
}

export type SQLiteBlobJsonBuilderInitial<TName extends string> = SQLiteBlobJsonBuilder<{
	name: TName;
	dataType: 'json';
	data: unknown;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class SQLiteBlobJsonBuilder<T extends ColumnBuilderBaseConfig<'json'>>
	extends SQLiteColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SQLiteBlobJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'SQLiteBlobJson');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteBlobJson(
			table,
			this.config as any,
		);
	}
}

export class SQLiteBlobJson<T extends ColumnBaseConfig<'json'>> extends SQLiteColumn<T> {
	static override readonly [entityKind]: string = 'SQLiteBlobJson';

	getSQLType(): string {
		return 'blob';
	}

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer): T['data'] {
		if (Buffer.isBuffer(value)) {
			return JSON.parse(value.toString());
		}

		// For RQBv2
		if (typeof value === 'string') {
			return JSON.parse(Buffer.from(value, 'hex').toString());
		}

		// for sqlite durable objects
		// eslint-disable-next-line no-instanceof/no-instanceof
		if (value instanceof ArrayBuffer) {
			const decoder = new TextDecoder();
			return JSON.parse(decoder.decode(value));
		}

		return JSON.parse(String.fromCodePoint(...value));
	}

	override mapToDriverValue(value: T['data']): Buffer {
		return Buffer.from(JSON.stringify(value));
	}
}

export type SQLiteBlobBufferBuilderInitial<TName extends string> = SQLiteBlobBufferBuilder<{
	name: TName;
	dataType: 'buffer';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class SQLiteBlobBufferBuilder<T extends ColumnBuilderBaseConfig<'buffer'>>
	extends SQLiteColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SQLiteBlobBufferBuilder';

	constructor(name: T['name']) {
		super(name, 'buffer', 'SQLiteBlobBuffer');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteBlobBuffer(table, this.config as any);
	}
}

export class SQLiteBlobBuffer<T extends ColumnBaseConfig<'buffer'>> extends SQLiteColumn<T> {
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
export function blob(): SQLiteBlobJsonBuilderInitial<''>;
export function blob<TMode extends BlobMode = BlobMode>(
	config?: BlobConfig<TMode>,
): Equal<TMode, 'bigint'> extends true ? SQLiteBigIntBuilderInitial<''>
	: Equal<TMode, 'buffer'> extends true ? SQLiteBlobBufferBuilderInitial<''>
	: SQLiteBlobJsonBuilderInitial<''>;
export function blob<TName extends string, TMode extends BlobMode = BlobMode>(
	name: TName,
	config?: BlobConfig<TMode>,
): Equal<TMode, 'bigint'> extends true ? SQLiteBigIntBuilderInitial<TName>
	: Equal<TMode, 'buffer'> extends true ? SQLiteBlobBufferBuilderInitial<TName>
	: SQLiteBlobJsonBuilderInitial<TName>;
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
