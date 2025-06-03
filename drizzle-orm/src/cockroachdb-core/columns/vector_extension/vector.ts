import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from '../common.ts';

export type CockroachDbVectorBuilderInitial<TName extends string, TDimensions extends number> =
	CockroachDbVectorBuilder<{
		name: TName;
		dataType: 'array';
		columnType: 'CockroachDbVector';
		data: number[];
		driverParam: string;
		enumValues: undefined;
		dimensions: TDimensions;
	}>;

export class CockroachDbVectorBuilder<
	T extends ColumnBuilderBaseConfig<'array', 'CockroachDbVector'> & { dimensions: number },
> extends CockroachDbColumnWithArrayBuilder<
	T,
	{ dimensions: T['dimensions'] },
	{ dimensions: T['dimensions'] }
> {
	static override readonly [entityKind]: string = 'CockroachDbVectorBuilder';

	constructor(name: string, config: CockroachDbVectorConfig<T['dimensions']>) {
		super(name, 'array', 'CockroachDbVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }> {
		return new CockroachDbVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbVector<
	T extends ColumnBaseConfig<'array', 'CockroachDbVector'> & { dimensions: number | undefined },
> extends CockroachDbColumn<T, { dimensions: T['dimensions'] }, { dimensions: T['dimensions'] }> {
	static override readonly [entityKind]: string = 'CockroachDbVector';

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

export interface CockroachDbVectorConfig<TDimensions extends number = number> {
	dimensions: TDimensions;
}

export function vector<D extends number>(
	config: CockroachDbVectorConfig<D>,
): CockroachDbVectorBuilderInitial<'', D>;
export function vector<TName extends string, D extends number>(
	name: TName,
	config: CockroachDbVectorConfig<D>,
): CockroachDbVectorBuilderInitial<TName, D>;
export function vector(a: string | CockroachDbVectorConfig, b?: CockroachDbVectorConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachDbVectorConfig>(a, b);
	return new CockroachDbVectorBuilder(name, config);
}
