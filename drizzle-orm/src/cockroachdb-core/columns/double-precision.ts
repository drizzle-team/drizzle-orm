import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';

export type CockroachDbDoublePrecisionBuilderInitial<TName extends string> = CockroachDbDoublePrecisionBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachDbDoublePrecision';
	data: number;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class CockroachDbDoublePrecisionBuilder<
	T extends ColumnBuilderBaseConfig<'number', 'CockroachDbDoublePrecision'>,
> extends CockroachDbColumnWithArrayBuilder<T> {
	static override readonly [entityKind]: string = 'CockroachDbDoublePrecisionBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'CockroachDbDoublePrecision');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbDoublePrecision<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbDoublePrecision<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbDoublePrecision<T extends ColumnBaseConfig<'number', 'CockroachDbDoublePrecision'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbDoublePrecision';

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

export function doublePrecision(): CockroachDbDoublePrecisionBuilderInitial<''>;
export function doublePrecision<TName extends string>(name: TName): CockroachDbDoublePrecisionBuilderInitial<TName>;
export function doublePrecision(name?: string) {
	return new CockroachDbDoublePrecisionBuilder(name ?? '');
}
