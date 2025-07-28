import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';

export class GelBigInt64Builder extends GelIntColumnBaseBuilder<{
	name: string;
	dataType: 'bigint';
	data: bigint;
	driverParam: bigint;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'GelBigInt64Builder';

	constructor(name: string) {
		super(name, 'bigint', 'GelBigInt64');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelBigInt64(
			table,
			this.config as any,
		);
	}
}

export class GelBigInt64<T extends ColumnBaseConfig<'bigint'>> extends GelColumn<T> {
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
