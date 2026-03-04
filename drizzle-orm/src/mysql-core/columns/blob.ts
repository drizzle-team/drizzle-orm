import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig, textDecoder } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlBlobColumnType = 'tinyblob' | 'blob' | 'mediumblob' | 'longblob';

export class MySqlStringBlobBuilder extends MySqlColumnBuilder<
	{
		dataType: 'string';
		data: string;
		driverParam: string;
	},
	{ blobType: MySqlBlobColumnType; length: number }
> {
	static override readonly [entityKind]: string = 'MySqlBlobBuilder';

	constructor(name: string, blobType: MySqlBlobColumnType) {
		super(name, 'string', 'MySqlBlob');
		this.config.blobType = blobType;
		switch (blobType) {
			case 'tinyblob': {
				this.config.length = 255;
				break;
			}
			case 'blob': {
				this.config.length = 65535;
				break;
			}
			case 'mediumblob': {
				this.config.length = 16777215;
				break;
			}
			case 'longblob': {
				this.config.length = 4294967295;
				break;
			}
		}
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlStringBlob(table, this.config as any);
	}
}

export class MySqlStringBlob<T extends ColumnBaseConfig<'string'>>
	extends MySqlColumn<T, { blobType: MySqlBlobColumnType }>
{
	static override readonly [entityKind]: string = 'MySqlBlob';

	readonly blobType: MySqlBlobColumnType = this.config.blobType;

	getSQLType(): string {
		return this.blobType;
	}

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer | string): T['data'] {
		if (typeof value === 'string') return atob(value);

		if (typeof Buffer !== 'undefined' && Buffer.from) {
			const buf = Buffer.isBuffer(value)
				? value
				// oxlint-disable-next-line drizzle-internal/no-instanceof
				: value instanceof ArrayBuffer
				? Buffer.from(value)
				: value.buffer
				? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
				: Buffer.from(value);
			return buf.toString('utf8');
		}

		return textDecoder!.decode(value as ArrayBuffer);
	}
}

export class MySqlBufferBlobBuilder extends MySqlColumnBuilder<
	{
		dataType: 'string';
		data: Buffer;
		driverParam: string;
	},
	{ blobType: MySqlBlobColumnType; length: number }
> {
	static override readonly [entityKind]: string = 'MySqlBlobBuilder';

	constructor(name: string, blobType: MySqlBlobColumnType) {
		super(name, 'string', 'MySqlBlob');
		this.config.blobType = blobType;
		switch (blobType) {
			case 'tinyblob': {
				this.config.length = 255;
				break;
			}
			case 'blob': {
				this.config.length = 65535;
				break;
			}
			case 'mediumblob': {
				this.config.length = 16777215;
				break;
			}
			case 'longblob': {
				this.config.length = 4294967295;
				break;
			}
		}
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlBufferBlob(table, this.config as any);
	}
}
export class MySqlBufferBlob<T extends ColumnBaseConfig<'object buffer'>>
	extends MySqlColumn<T, { blobType: MySqlBlobColumnType }>
{
	static override readonly [entityKind]: string = 'MySqlBlob';

	readonly blobType: MySqlBlobColumnType = this.config.blobType;

	getSQLType(): string {
		return this.blobType;
	}

	override mapFromDriverValue(value: Buffer | Uint8Array | ArrayBuffer | string): T['data'] {
		if (typeof value === 'string') return Buffer.from(value, 'base64');

		if (Buffer.isBuffer(value)) {
			return value;
		}

		return Buffer.from(value as Uint8Array);
	}
}

export interface MySqlBlobConfig<
	TMode extends 'buffer' | 'string' = 'buffer' | 'string',
> {
	mode?: TMode;
}

export function blob<TMode extends MySqlBlobConfig['mode'] & {}>(
	config?: MySqlBlobConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlStringBlobBuilder
	: MySqlBufferBlobBuilder;
export function blob<TMode extends MySqlBlobConfig['mode'] & {}>(
	name: string,
	config?: MySqlBlobConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlStringBlobBuilder
	: MySqlBufferBlobBuilder;
export function blob(a?: string | MySqlBlobConfig, b: MySqlBlobConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<MySqlBlobConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MySqlStringBlobBuilder(name, 'blob');
	}
	return new MySqlBufferBlobBuilder(name, 'blob');
}

export function tinyblob<TMode extends MySqlBlobConfig['mode'] & {}>(
	config?: MySqlBlobConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlStringBlobBuilder
	: MySqlBufferBlobBuilder;
export function tinyblob<TMode extends MySqlBlobConfig['mode'] & {}>(
	name: string,
	config?: MySqlBlobConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlStringBlobBuilder
	: MySqlBufferBlobBuilder;
export function tinyblob(a?: string | MySqlBlobConfig, b: MySqlBlobConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<MySqlBlobConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MySqlStringBlobBuilder(name, 'tinyblob');
	}
	return new MySqlBufferBlobBuilder(name, 'tinyblob');
}

export function mediumblob<TMode extends MySqlBlobConfig['mode'] & {}>(
	config?: MySqlBlobConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlStringBlobBuilder
	: MySqlBufferBlobBuilder;
export function mediumblob<TMode extends MySqlBlobConfig['mode'] & {}>(
	name: string,
	config?: MySqlBlobConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlStringBlobBuilder
	: MySqlBufferBlobBuilder;
export function mediumblob(a?: string | MySqlBlobConfig, b: MySqlBlobConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<MySqlBlobConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MySqlStringBlobBuilder(name, 'mediumblob');
	}
	return new MySqlBufferBlobBuilder(name, 'mediumblob');
}

export function longblob<TMode extends MySqlBlobConfig['mode'] & {}>(
	config?: MySqlBlobConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlStringBlobBuilder
	: MySqlBufferBlobBuilder;
export function longblob<TMode extends MySqlBlobConfig['mode'] & {}>(
	name: string,
	config?: MySqlBlobConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlStringBlobBuilder
	: MySqlBufferBlobBuilder;
export function longblob(a?: string | MySqlBlobConfig, b: MySqlBlobConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<MySqlBlobConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MySqlStringBlobBuilder(name, 'longblob');
	}
	return new MySqlBufferBlobBuilder(name, 'longblob');
}
