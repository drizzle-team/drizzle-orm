import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';

export type CockroachDbBinaryVectorBuilderInitial<TName extends string, TDimensions extends number> =
	CockroachDbBinaryVectorBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'CockroachDbBinaryVector';
		data: string;
		driverParam: string;
		enumValues: undefined;
		dimensions: TDimensions;
	}>;

export class CockroachDbBinaryVectorBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachDbBinaryVector'> & { dimensions: number },
> extends CockroachDbColumnWithArrayBuilder<
	T,
	{ dimensions: T['dimensions'] }
> {
	static override readonly [entityKind]: string = 'CockroachDbBinaryVectorBuilder';

	constructor(name: string, config: CockroachDbBinaryVectorConfig<T['dimensions']>) {
		super(name, 'string', 'CockroachDbBinaryVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbBinaryVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }> {
		return new CockroachDbBinaryVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbBinaryVector<
	T extends ColumnBaseConfig<'string', 'CockroachDbBinaryVector'> & { dimensions: number },
> extends CockroachDbColumn<T, { dimensions: T['dimensions'] }, { dimensions: T['dimensions'] }> {
	static override readonly [entityKind]: string = 'CockroachDbBinaryVector';

	readonly dimensions = this.config.dimensions;

	getSQLType(): string {
		return `bit(${this.dimensions})`;
	}
}

export interface CockroachDbBinaryVectorConfig<TDimensions extends number = number> {
	dimensions: TDimensions;
}

export function bit<D extends number>(
	config: CockroachDbBinaryVectorConfig<D>,
): CockroachDbBinaryVectorBuilderInitial<'', D>;
export function bit<TName extends string, D extends number>(
	name: TName,
	config: CockroachDbBinaryVectorConfig<D>,
): CockroachDbBinaryVectorBuilderInitial<TName, D>;
export function bit(a: string | CockroachDbBinaryVectorConfig, b?: CockroachDbBinaryVectorConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachDbBinaryVectorConfig>(a, b);
	return new CockroachDbBinaryVectorBuilder(name, config);
}
