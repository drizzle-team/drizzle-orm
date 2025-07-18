import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
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
	override build(table: GelTable) {
		return new GelBytes(
			table,
			this.config as any,
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
