import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, type CockroachColumnBaseConfig, CockroachColumnBuilder } from './common.ts';

export class CockroachFloatBuilder extends CockroachColumnBuilder<
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

export class CockroachFloat<T extends CockroachColumnBaseConfig<'number double'>>
	extends CockroachColumn<'number double', T>
{
	static override readonly [entityKind]: string = 'CockroachFloat';

	/** @internal */
	override readonly codec = 'float';

	getSQLType(): string {
		return 'float';
	}
}
export function float(name?: string) {
	return new CockroachFloatBuilder(name ?? '');
}

// double precision is alias for float
export const doublePrecision = float;
