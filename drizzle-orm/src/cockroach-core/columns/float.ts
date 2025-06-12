import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachFloatBuilderInitial<TName extends string> = CockroachFloatBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachFloat';
	data: number;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class CockroachFloatBuilder<
	T extends ColumnBuilderBaseConfig<'number', 'CockroachFloat'>,
> extends CockroachColumnWithArrayBuilder<T> {
	static override readonly [entityKind]: string = 'CockroachFloatBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'CockroachFloat');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachFloat<MakeColumnConfig<T, TTableName>> {
		return new CockroachFloat<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachFloat<T extends ColumnBaseConfig<'number', 'CockroachFloat'>> extends CockroachColumn<T> {
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

export function float(): CockroachFloatBuilderInitial<''>;
export function float<TName extends string>(name: TName): CockroachFloatBuilderInitial<TName>;
export function float(name?: string) {
	return new CockroachFloatBuilder(name ?? '');
}

// double precision is alias for float
export const doublePrecision = float;
