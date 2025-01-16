import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgVectorBuilderInitial<TName extends string, TDimensions extends number> = PgVectorBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'PgVector';
	data: number[];
	driverParam: string;
	enumValues: undefined;
	dimensions: TDimensions;
}>;

export class PgVectorBuilder<T extends ColumnBuilderBaseConfig<'array', 'PgVector'> & { dimensions: number }>
	extends PgColumnBuilder<
		T,
		{ dimensions: T['dimensions'] },
		{ dimensions: T['dimensions'] }
	>
{
	static override readonly [entityKind]: string = 'PgVectorBuilder';

	constructor(name: string, config: PgVectorConfig<T['dimensions']>) {
		super(name, 'array', 'PgVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }> {
		return new PgVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgVector<T extends ColumnBaseConfig<'array', 'PgVector'> & { dimensions: number | undefined }>
	extends PgColumn<T, { dimensions: T['dimensions'] }, { dimensions: T['dimensions'] }>
{
	static override readonly [entityKind]: string = 'PgVector';

	readonly dimensions: T['dimensions'] = this.config.dimensions;

	getSQLType(): string {
		return `vector(${this.dimensions})`;
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

export interface PgVectorConfig<TDimensions extends number = number> {
	dimensions: TDimensions;
}

export function vector<D extends number>(
	config: PgVectorConfig<D>,
): PgVectorBuilderInitial<'', D>;
export function vector<TName extends string, D extends number>(
	name: TName,
	config: PgVectorConfig<D>,
): PgVectorBuilderInitial<TName, D>;
export function vector(a: string | PgVectorConfig, b?: PgVectorConfig) {
	const { name, config } = getColumnNameAndConfig<PgVectorConfig>(a, b);
	return new PgVectorBuilder(name, config);
}
