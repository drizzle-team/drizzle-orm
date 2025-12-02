import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';

export class GelBigInt64Builder extends GelIntColumnBaseBuilder<{
	dataType: 'bigint int64';
	data: bigint;
	driverParam: bigint;
}> {
	static override readonly [entityKind]: string = 'GelBigInt64Builder';

	constructor(name: string) {
		super(name, 'bigint int64', 'GelBigInt64');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelBigInt64(
			table,
			this.config as any,
		);
	}
}

export class GelBigInt64<T extends ColumnBaseConfig<'bigint int64'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelBigInt64';

	getSQLType(): string {
		return 'edgedbt.bigint_t';
	}

	override mapFromDriverValue(value: string): bigint {
		return BigInt(value as string); // TODO ts error if remove 'as string'
	}
}
export function bigintT(name?: string): GelBigInt64Builder {
	return new GelBigInt64Builder(name ?? '');
}
