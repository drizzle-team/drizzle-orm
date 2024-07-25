import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { Equal } from '~/utils';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';
import type { AnySingleStoreTable } from '../table';

type BlobMode = 'buffer' | 'json' | 'bigint';

export type SingleStoreBigIntBuilderInitial<TName extends string> = SingleStoreBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'SingleStoreBigInt';
	data: bigint;
	driverParam: Buffer;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint', 'SingleStoreBigInt'>>
	extends SingleStoreColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SingleStoreBigIntBuilder';

	constructor(name: T['name']) {
		super(name, 'bigint', 'SingleStoreBigInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBigInt<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any>,
		);
	}
}

export class SingleStoreBigInt<T extends ColumnBaseConfig<'bigint', 'SingleStoreBigInt'>> extends SingleStoreColumn<T> {
	static readonly [entityKind]: string = 'SingleStoreBigInt';

	getSQLType(): string {
		return 'blob';
	}

	override mapFromDriverValue(value: Buffer): bigint {
		return BigInt(value.toString());
	}

	override mapToDriverValue(value: bigint): Buffer {
		return Buffer.from(value.toString());
	}
}

export type SingleStoreBlobJsonBuilderInitial<TName extends string> = SingleStoreBlobJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'SingleStoreBlobJson';
	data: unknown;
	driverParam: Buffer;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreBlobJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'SingleStoreBlobJson'>>
	extends SingleStoreColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SingleStoreBlobJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'SingleStoreBlobJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBlobJson<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBlobJson<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any>,
		);
	}
}

export class SingleStoreBlobJson<T extends ColumnBaseConfig<'json', 'SingleStoreBlobJson'>>
	extends SingleStoreColumn<T>
{
	static readonly [entityKind]: string = 'SingleStoreBlobJson';

	getSQLType(): string {
		return 'blob';
	}

	override mapFromDriverValue(value: Buffer): T['data'] {
		return JSON.parse(value.toString());
	}

	override mapToDriverValue(value: T['data']): Buffer {
		return Buffer.from(JSON.stringify(value));
	}
}

export type SingleStoreBlobBufferBuilderInitial<TName extends string> = SingleStoreBlobBufferBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'SingleStoreBlobBuffer';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreBlobBufferBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'SingleStoreBlobBuffer'>>
	extends SingleStoreColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SingleStoreBlobBufferBuilder';

	constructor(name: T['name']) {
		super(name, 'buffer', 'SingleStoreBlobBuffer');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBlobBuffer<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBlobBuffer<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any>,
		);
	}
}

export class SingleStoreBlobBuffer<T extends ColumnBaseConfig<'buffer', 'SingleStoreBlobBuffer'>>
	extends SingleStoreColumn<T>
{
	static readonly [entityKind]: string = 'SingleStoreBlobBuffer';

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
export function blob<TName extends string, TMode extends BlobMode = BlobMode>(
	name: TName,
	config?: BlobConfig<TMode>,
): Equal<TMode, 'bigint'> extends true ? SingleStoreBigIntBuilderInitial<TName>
	: Equal<TMode, 'buffer'> extends true ? SingleStoreBlobBufferBuilderInitial<TName>
	: SingleStoreBlobJsonBuilderInitial<TName>;
export function blob(name: string, config?: BlobConfig) {
	if (config?.mode === 'json') {
		return new SingleStoreBlobJsonBuilder(name);
	}
	if (config?.mode === 'bigint') {
		return new SingleStoreBigIntBuilder(name);
	}
	return new SingleStoreBlobBufferBuilder(name);
}
