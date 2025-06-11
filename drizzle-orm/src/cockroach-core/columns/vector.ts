import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnBuilder } from './common.ts';

export type CockroachVectorBuilderInitial<TName extends string, TDimensions extends number> = CockroachVectorBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'CockroachVector';
	data: number[];
	driverParam: string;
	enumValues: undefined;
	dimensions: TDimensions;
}>;

export class CockroachVectorBuilder<
	T extends ColumnBuilderBaseConfig<'array', 'CockroachVector'> & { dimensions: number },
> extends CockroachColumnBuilder<
	T,
	{ dimensions: T['dimensions'] },
	{ dimensions: T['dimensions'] }
> {
	static override readonly [entityKind]: string = 'CockroachVectorBuilder';

	constructor(name: string, config: CockroachVectorConfig<T['dimensions']>) {
		super(name, 'array', 'CockroachVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }> {
		return new CockroachVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachVector<
	T extends ColumnBaseConfig<'array', 'CockroachVector'> & { dimensions: number | undefined },
> extends CockroachColumn<T, { dimensions: T['dimensions'] }, { dimensions: T['dimensions'] }> {
	static override readonly [entityKind]: string = 'CockroachVector';

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

export interface CockroachVectorConfig<TDimensions extends number = number> {
	dimensions: TDimensions;
}

export function vector<D extends number>(
	config: CockroachVectorConfig<D>,
): CockroachVectorBuilderInitial<'', D>;
export function vector<TName extends string, D extends number>(
	name: TName,
	config: CockroachVectorConfig<D>,
): CockroachVectorBuilderInitial<TName, D>;
export function vector(a: string | CockroachVectorConfig, b?: CockroachVectorConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachVectorConfig>(a, b);
	return new CockroachVectorBuilder(name, config);
}
