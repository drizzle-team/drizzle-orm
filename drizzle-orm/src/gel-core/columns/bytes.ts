import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export class GelBytesBuilder extends GelColumnBuilder<{
	dataType: 'object buffer';
	data: Uint8Array;
	driverParam: Uint8Array | Buffer;
}> {
	static override readonly [entityKind]: string = 'GelBytesBuilder';

	constructor(name: string) {
		super(name, 'object buffer', 'GelBytes');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelBytes(
			table,
			this.config as any,
		);
	}
}

export class GelBytes<T extends ColumnBaseConfig<'object buffer'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelBytes';

	getSQLType(): string {
		return 'bytea';
	}
}

export function bytes(name?: string): GelBytesBuilder {
	return new GelBytesBuilder(name ?? '');
}
