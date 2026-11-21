import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreVarBinaryBuilderInitial<TName extends string> = SingleStoreVarBinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'SingleStoreVarBinary';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreVarBinaryBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'SingleStoreVarBinary'>>
	extends SingleStoreColumnBuilder<T, SingleStoreVarbinaryOptions>
{
	static override readonly [entityKind]: string = 'SingleStoreVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: SingleStoreVarbinaryOptions) {
		super(name, 'buffer', 'SingleStoreVarBinary');
		this.config.length = config?.length;
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
	T extends ColumnBaseConfig<'buffer', 'SingleStoreVarBinary'>,
> extends SingleStoreColumn<T, SingleStoreVarbinaryOptions> {
	static override readonly [entityKind]: string = 'SingleStoreVarBinary';

	length: number | undefined = this.config.length;

	override mapFromDriverValue(value: string | Buffer | Uint8Array): Buffer {
		if (typeof value === 'string') return Buffer.from(value);
		if (Buffer.isBuffer(value)) return value;
		return Buffer.from(value);
	}

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface SingleStoreVarbinaryOptions {
	length: number;
}

export function varbinary(
	config: SingleStoreVarbinaryOptions,
): SingleStoreVarBinaryBuilderInitial<''>;
export function varbinary<TName extends string>(
	name: TName,
	config: SingleStoreVarbinaryOptions,
): SingleStoreVarBinaryBuilderInitial<TName>;
export function varbinary(a?: string | SingleStoreVarbinaryOptions, b?: SingleStoreVarbinaryOptions) {
	const { name, config } = getColumnNameAndConfig<SingleStoreVarbinaryOptions>(a, b);
	return new SingleStoreVarBinaryBuilder(name, config);
}
