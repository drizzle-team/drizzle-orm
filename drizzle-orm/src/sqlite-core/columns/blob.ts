import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { bytesFromUtf8 } from '~/sqlite-core/codecs.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

type BlobMode = 'buffer' | 'json' | 'bigint';

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

	/** @internal */
	override readonly codec = 'blob:bigint';

	getSQLType(): string {
		return 'blob';
	}

	override mapToDriverValue = (value: bigint): Buffer => {
		return bytesFromUtf8(value.toString());
	};
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

	/** @internal */
	override readonly codec = 'blob:json';

	getSQLType(): string {
		return 'blob';
	}

	override mapToDriverValue = (value: T['data']): Buffer => {
		return bytesFromUtf8(JSON.stringify(value));
	};
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

	/** @internal */
	override readonly codec = 'blob';

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
	if (config?.mode === 'bigint') {
		return new SQLiteBigIntBuilder(name);
	}
	if (config?.mode === 'buffer') {
		return new SQLiteBlobBufferBuilder(name);
	}
	return new SQLiteBlobJsonBuilder(name);
}
