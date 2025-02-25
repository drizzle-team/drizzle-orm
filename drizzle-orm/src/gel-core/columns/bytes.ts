import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelBytesBuilderInitial<TName extends string> = GelBytesBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'GelBytes';
	data: Uint8Array;
	driverParam: Uint8Array | Buffer;
	enumValues: undefined;
}>;

export class GelBytesBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'GelBytes'>> extends GelColumnBuilder<T> {
	static override readonly [entityKind]: string = 'GelBytesBuilder';

	constructor(name: T['name']) {
		super(name, 'buffer', 'GelBytes');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelBytes<MakeColumnConfig<T, TTableName>> {
		return new GelBytes<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GelBytes<T extends ColumnBaseConfig<'buffer', 'GelBytes'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelBytes';

	getSQLType(): string {
		return 'bytea';
	}
}

export function bytes(): GelBytesBuilderInitial<''>;
export function bytes<TName extends string>(name: TName): GelBytesBuilderInitial<TName>;
export function bytes(name?: string) {
	return new GelBytesBuilder(name ?? '');
}
