import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgDoublePrecisionBuilder extends PgColumnBuilder<{
	dataType: 'number double';
	data: number;
	driverParam: string | number;
}> {
	static override readonly [entityKind]: string = 'PgDoublePrecisionBuilder';

	constructor(name: string) {
		super(name, 'number double', 'PgDoublePrecision');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgDoublePrecision(
			table,
			this.config,
		);
	}
}

export class PgDoublePrecision extends PgColumn<'number double'> {
	static override readonly [entityKind]: string = 'PgDoublePrecision';

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

export function doublePrecision(name?: string): PgDoublePrecisionBuilder {
	return new PgDoublePrecisionBuilder(name ?? '');
}
