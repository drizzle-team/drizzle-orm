import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export class PgBinaryVectorBuilder extends PgColumnBuilder<
	{
		dataType: 'string binary';
		data: string;
		driverParam: string;
	},
	{ length: number; isLengthExact: true }
> {
	static override readonly [entityKind]: string = 'PgBinaryVectorBuilder';

	constructor(name: string, config: PgBinaryVectorConfig) {
		super(name, 'string binary', 'PgBinaryVector');
		this.config.length = config.dimensions;
		this.config.isLengthExact = true;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgBinaryVector(
			table,
			this.config as any,
		);
	}
}

export class PgBinaryVector extends PgColumn<'string binary'> {
	static override readonly [entityKind]: string = 'PgBinaryVector';

	getSQLType(): string {
		return `bit(${this.length})`;
	}
}

export interface PgBinaryVectorConfig {
	dimensions: number;
}

export function bit(
	config: PgBinaryVectorConfig,
): PgBinaryVectorBuilder;
export function bit(
	name: string,
	config: PgBinaryVectorConfig,
): PgBinaryVectorBuilder;
export function bit(a: string | PgBinaryVectorConfig, b?: PgBinaryVectorConfig) {
	const { name, config } = getColumnNameAndConfig<PgBinaryVectorConfig>(a, b);
	return new PgBinaryVectorBuilder(name, config);
}
