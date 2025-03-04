import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelDoublePrecisionBuilderInitial<TName extends string> = GelDoublePrecisionBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GelDoublePrecision';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class GelDoublePrecisionBuilder<T extends ColumnBuilderBaseConfig<'number', 'GelDoublePrecision'>>
	extends GelColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GelDoublePrecisionBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'GelDoublePrecision');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelDoublePrecision<MakeColumnConfig<T, TTableName>> {
		return new GelDoublePrecision<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GelDoublePrecision<T extends ColumnBaseConfig<'number', 'GelDoublePrecision'>> extends GelColumn<T> {
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
