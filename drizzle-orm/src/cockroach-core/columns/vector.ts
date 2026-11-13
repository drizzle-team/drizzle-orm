import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, type CockroachColumnBaseConfig, CockroachColumnBuilder } from './common.ts';

export class CockroachVectorBuilder extends CockroachColumnBuilder<
	{
		dataType: 'array vector';
		data: number[];
		driverParam: string;
	},
	{ length: number }
> {
	static override readonly [entityKind]: string = 'CockroachVectorBuilder';

	constructor(name: string, config: CockroachVectorConfig) {
		super(name, 'array vector', 'CockroachVector');
		this.config.length = config.dimensions;
	}

	/**
	 * @throws always - CockroachDB has no array type for `vector`
	 */
	override array(): never {
		throw new Error('CockroachDB does not support arrays of vector columns');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachVector(
			table,
			this.config,
		);
	}
}

export class CockroachVector<
	T extends CockroachColumnBaseConfig<'array vector'>,
> extends CockroachColumn<'array vector', T, { length: number }> {
	static override readonly [entityKind]: string = 'CockroachVector';

	/** @internal */
	override readonly codec = 'vector';

	getSQLType(): string {
		return `vector(${this.config.length})`;
	}

	override mapToDriverValue = (value: unknown): unknown => {
		return JSON.stringify(value);
	};
}

export interface CockroachVectorConfig {
	dimensions: number;
}

export function vector(
	config: CockroachVectorConfig,
): CockroachVectorBuilder;
export function vector(
	name: string,
	config: CockroachVectorConfig,
): CockroachVectorBuilder;
export function vector(a: string | CockroachVectorConfig, b?: CockroachVectorConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachVectorConfig>(a, b);
	return new CockroachVectorBuilder(name, config);
}
