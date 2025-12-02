import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export class GelDoublePrecisionBuilder extends GelColumnBuilder<{
	dataType: 'number double';
	data: number;
	driverParam: number;
}> {
	static override readonly [entityKind]: string = 'GelDoublePrecisionBuilder';

	constructor(name: string) {
		super(name, 'number double', 'GelDoublePrecision');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelDoublePrecision(
			table,
			this.config as any,
		);
	}
}

export class GelDoublePrecision<T extends ColumnBaseConfig<'number double'>> extends GelColumn<T> {
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

export function doublePrecision(name?: string): GelDoublePrecisionBuilder {
	return new GelDoublePrecisionBuilder(name ?? '');
}
