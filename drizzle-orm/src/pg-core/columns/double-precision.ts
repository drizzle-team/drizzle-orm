import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgDoublePrecisionBuilderInitial<TName extends string> = PgDoublePrecisionBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'PgDoublePrecision';
	data: number;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class PgDoublePrecisionBuilder<T extends ColumnBuilderBaseConfig<'number', 'PgDoublePrecision'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgDoublePrecisionBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'PgDoublePrecision');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDoublePrecision<MakeColumnConfig<T, TTableName>> {
		return new PgDoublePrecision<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgDoublePrecision<T extends ColumnBaseConfig<'number', 'PgDoublePrecision'>> extends PgColumn<T> {
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

export function doublePrecision(): PgDoublePrecisionBuilderInitial<''>;
export function doublePrecision<TName extends string>(name: TName): PgDoublePrecisionBuilderInitial<TName>;
export function doublePrecision(name?: string) {
	return new PgDoublePrecisionBuilder(name ?? '');
}
