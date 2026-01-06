import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export class PgHalfVectorBuilder extends PgColumnBuilder<
	{
		dataType: 'array halfvector';
		data: number[];
		driverParam: string;
	},
	{ length: number; isLengthExact: true }
> {
	static override readonly [entityKind]: string = 'PgHalfVectorBuilder';

	constructor(name: string, config: PgHalfVectorConfig) {
		super(name, 'array halfvector', 'PgHalfVector');
		this.config.length = config.dimensions;
		this.config.isLengthExact = true;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgHalfVector(
			table,
			this.config as any,
		);
	}
}

export class PgHalfVector extends PgColumn<'array halfvector'> {
	static override readonly [entityKind]: string = 'PgHalfVector';

	getSQLType(): string {
		return `halfvec(${this.length})`;
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

export interface PgHalfVectorConfig {
	dimensions: number;
}

export function halfvec(
	config: PgHalfVectorConfig,
): PgHalfVectorBuilder;
export function halfvec(
	name: string,
	config: PgHalfVectorConfig,
): PgHalfVectorBuilder;
export function halfvec(a: string | PgHalfVectorConfig, b?: PgHalfVectorConfig) {
	const { name, config } = getColumnNameAndConfig<PgHalfVectorConfig>(a, b);
	return new PgHalfVectorBuilder(name, config);
}
