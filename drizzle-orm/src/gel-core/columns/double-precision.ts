import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelDoublePrecisionBuilderInitial<TName extends string> = GelDoublePrecisionBuilder<{
	name: TName;
	dataType: 'number';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class GelDoublePrecisionBuilder<T extends ColumnBuilderBaseConfig<'number'>>
	extends GelColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GelDoublePrecisionBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'GelDoublePrecision');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelDoublePrecision(
			table,
			this.config as any,
		);
	}
}

export class GelDoublePrecision<T extends ColumnBaseConfig<'number'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelDoublePrecision';

	getSQLType(): string {
		return 'double precision';
	}

	override mapFromDriverValue(value: string | number): number {
		if (typeof value === 'string') {
			return Number.parseFloat(value);
		}
		return value;
	}
}

export function doublePrecision(): GelDoublePrecisionBuilderInitial<''>;
export function doublePrecision<TName extends string>(name: TName): GelDoublePrecisionBuilderInitial<TName>;
export function doublePrecision(name?: string) {
	return new GelDoublePrecisionBuilder(name ?? '');
}
