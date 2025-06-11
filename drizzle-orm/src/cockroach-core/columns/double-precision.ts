import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachDoublePrecisionBuilderInitial<TName extends string> = CockroachDoublePrecisionBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachDoublePrecision';
	data: number;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class CockroachDoublePrecisionBuilder<
	T extends ColumnBuilderBaseConfig<'number', 'CockroachDoublePrecision'>,
> extends CockroachColumnWithArrayBuilder<T> {
	static override readonly [entityKind]: string = 'CockroachDoublePrecisionBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'CockroachDoublePrecision');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachDoublePrecision<MakeColumnConfig<T, TTableName>> {
		return new CockroachDoublePrecision<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDoublePrecision<T extends ColumnBaseConfig<'number', 'CockroachDoublePrecision'>>
	extends CockroachColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDoublePrecision';

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

export function doublePrecision(): CockroachDoublePrecisionBuilderInitial<''>;
export function doublePrecision<TName extends string>(name: TName): CockroachDoublePrecisionBuilderInitial<TName>;
export function doublePrecision(name?: string) {
	return new CockroachDoublePrecisionBuilder(name ?? '');
}
