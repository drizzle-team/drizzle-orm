import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachBinaryVectorBuilderInitial<TName extends string, TDimensions extends number> =
	CockroachBinaryVectorBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'CockroachBinaryVector';
		data: string;
		driverParam: string;
		enumValues: undefined;
		dimensions: TDimensions;
	}>;

export class CockroachBinaryVectorBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachBinaryVector'> & { dimensions: number },
> extends CockroachColumnWithArrayBuilder<
	T,
	{ dimensions: T['dimensions'] }
> {
	static override readonly [entityKind]: string = 'CockroachBinaryVectorBuilder';

	constructor(name: string, config: CockroachBinaryVectorConfig<T['dimensions']>) {
		super(name, 'string', 'CockroachBinaryVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachBinaryVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }> {
		return new CockroachBinaryVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachBinaryVector<
	T extends ColumnBaseConfig<'string', 'CockroachBinaryVector'> & { dimensions: number },
> extends CockroachColumn<T, { dimensions: T['dimensions'] }, { dimensions: T['dimensions'] }> {
	static override readonly [entityKind]: string = 'CockroachBinaryVector';

	readonly dimensions = this.config.dimensions;

	getSQLType(): string {
		return `bit(${this.dimensions})`;
	}
}

export interface CockroachBinaryVectorConfig<TDimensions extends number = number> {
	dimensions: TDimensions;
}

export function bit<D extends number>(
	config: CockroachBinaryVectorConfig<D>,
): CockroachBinaryVectorBuilderInitial<'', D>;
export function bit<TName extends string, D extends number>(
	name: TName,
	config: CockroachBinaryVectorConfig<D>,
): CockroachBinaryVectorBuilderInitial<TName, D>;
export function bit(a: string | CockroachBinaryVectorConfig, b?: CockroachBinaryVectorConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachBinaryVectorConfig>(a, b);
	return new CockroachBinaryVectorBuilder(name, config);
}
