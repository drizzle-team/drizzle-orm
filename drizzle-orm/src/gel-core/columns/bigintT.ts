import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';

export type GelBigInt64BuilderInitial<TName extends string> = GelBigInt64Builder<{
	name: TName;
	dataType: 'bigint';
	data: bigint;
	driverParam: bigint;
	enumValues: undefined;
}>;

export class GelBigInt64Builder<T extends ColumnBuilderBaseConfig<'bigint'>>
	extends GelIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'GelBigInt64Builder';

	constructor(name: T['name']) {
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

export function bigintT(): GelBigInt64BuilderInitial<''>;
export function bigintT<TName extends string>(name: TName): GelBigInt64BuilderInitial<TName>;
export function bigintT(name?: string) {
	return new GelBigInt64Builder(name ?? '');
}
