import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreBinaryBuilderInitial<TName extends string> = SingleStoreBinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'SingleStoreBinary';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreBinaryBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'SingleStoreBinary'>>
	extends SingleStoreColumnBuilder<
		T,
		SingleStoreBinaryConfig
	>
{
	static override readonly [entityKind]: string = 'SingleStoreBinaryBuilder';

	constructor(name: T['name'], length: number | undefined) {
		super(name, 'buffer', 'SingleStoreBinary');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBinary<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBinary<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreBinary<T extends ColumnBaseConfig<'buffer', 'SingleStoreBinary'>> extends SingleStoreColumn<
	T,
	SingleStoreBinaryConfig
> {
	static override readonly [entityKind]: string = 'SingleStoreBinary';

	length: number | undefined = this.config.length;

	override mapFromDriverValue(value: string | Buffer | Uint8Array): Buffer {
		if (typeof value === 'string') return Buffer.from(value);
		if (Buffer.isBuffer(value)) return value;
		return Buffer.from(value);
	}

	getSQLType(): string {
		return this.length === undefined ? `binary` : `binary(${this.length})`;
	}
}

export interface SingleStoreBinaryConfig {
	length?: number;
}

export function binary(): SingleStoreBinaryBuilderInitial<''>;
export function binary(
	config?: SingleStoreBinaryConfig,
): SingleStoreBinaryBuilderInitial<''>;
export function binary<TName extends string>(
	name: TName,
	config?: SingleStoreBinaryConfig,
): SingleStoreBinaryBuilderInitial<TName>;
export function binary(a?: string | SingleStoreBinaryConfig, b: SingleStoreBinaryConfig = {}) {
	const { name, config } = getColumnNameAndConfig<SingleStoreBinaryConfig>(a, b);
	return new SingleStoreBinaryBuilder(name, config.length);
}
