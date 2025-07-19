import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgHalfVectorBuilderInitial<TName extends string, TDimensions extends number> = PgHalfVectorBuilder<{
	name: TName;
	dataType: 'array';
	data: number[];
	driverParam: string;
	enumValues: undefined;
	dimensions: TDimensions;
}>;

export class PgHalfVectorBuilder<T extends ColumnBuilderBaseConfig<'array'> & { dimensions: number }>
	extends PgColumnBuilder<
		T,
		{ dimensions: T['dimensions'] }
	>
{
	static override readonly [entityKind]: string = 'PgHalfVectorBuilder';

	constructor(name: string, config: PgHalfVectorConfig<T['dimensions']>) {
		super(name, 'array', 'PgHalfVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgHalfVector(
			table,
			this.config as any,
		);
	}
}

export class PgHalfVector<T extends ColumnBaseConfig<'array'> & { dimensions: number }>
	extends PgColumn<T, { dimensions: T['dimensions'] }>
{
	static override readonly [entityKind]: string = 'PgHalfVector';

	readonly dimensions: T['dimensions'] = this.config.dimensions;

	getSQLType(): string {
		return `halfvec(${this.dimensions})`;
	}

	override mapToDriverValue(value: unknown): unknown {
		return JSON.stringify(value);
	}

	override mapFromDriverValue(value: string): unknown {
		return value
			.slice(1, -1)
			.split(',')
			.map((v) => Number.parseFloat(v));
	}
}

export interface PgHalfVectorConfig<TDimensions extends number = number> {
	dimensions: TDimensions;
}

export function halfvec<D extends number>(
	config: PgHalfVectorConfig<D>,
): PgHalfVectorBuilderInitial<'', D>;
export function halfvec<TName extends string, D extends number>(
	name: TName,
	config: PgHalfVectorConfig,
): PgHalfVectorBuilderInitial<TName, D>;
export function halfvec(a: string | PgHalfVectorConfig, b?: PgHalfVectorConfig) {
	const { name, config } = getColumnNameAndConfig<PgHalfVectorConfig>(a, b);
	return new PgHalfVectorBuilder(name, config);
}
