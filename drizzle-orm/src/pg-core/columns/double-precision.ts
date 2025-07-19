import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type {  PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgDoublePrecisionBuilderInitial<TName extends string> = PgDoublePrecisionBuilder<{
	name: TName;
	dataType: 'number';
	data: number;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class PgDoublePrecisionBuilder<T extends ColumnBuilderBaseConfig<'number'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgDoublePrecisionBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'PgDoublePrecision');
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgDoublePrecision(
			table,
			this.config,
		);
	}
}

export class PgDoublePrecision<T extends ColumnBaseConfig<'number'>> extends PgColumn<T> {
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
