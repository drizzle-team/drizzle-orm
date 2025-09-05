import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export class CockroachFloatBuilder extends CockroachColumnWithArrayBuilder<
	{
		dataType: 'number double';
		data: number;
		driverParam: string | number;
	}
> {
	static override readonly [entityKind]: string = 'CockroachFloatBuilder';

	constructor(name: string) {
		super(name, 'number double', 'CockroachFloat');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachFloat(
			table,
			this.config,
		);
	}
}

export class CockroachFloat<T extends ColumnBaseConfig<'number double'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachFloat';

	getSQLType(): string {
		return 'float';
	}

	override mapFromDriverValue(value: string | number): number {
		if (typeof value === 'string') {
			return Number.parseFloat(value);
		}
		return value;
	}
}
export function float(name?: string) {
	return new CockroachFloatBuilder(name ?? '');
}

// double precision is alias for float
export const doublePrecision = float;
