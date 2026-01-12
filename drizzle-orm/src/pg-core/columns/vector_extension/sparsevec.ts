import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import type { PgColumnBaseConfig } from '../common.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export class PgSparseVectorBuilder extends PgColumnBuilder<
	{
		dataType: 'string sparsevec';
		data: string;
		driverParam: string;
	},
	{ vectorDimensions: number | undefined }
> {
	static override readonly [entityKind]: string = 'PgSparseVectorBuilder';

	constructor(name: string, config: PgSparseVectorConfig) {
		super(name, 'string sparsevec', 'PgSparseVector');
		this.config.vectorDimensions = config.dimensions;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgSparseVector(
			table,
			this.config as any,
		);
	}
}

export class PgSparseVector
	extends PgColumn<'string sparsevec', PgColumnBaseConfig<'string sparsevec'>, { vectorDimensions: number | undefined }>
{
	static override readonly [entityKind]: string = 'PgSparseVector';

	readonly vectorDimensions = this.config.vectorDimensions;

	getSQLType(): string {
		return `sparsevec(${this.vectorDimensions})`;
	}
}

export interface PgSparseVectorConfig {
	dimensions: number;
}

export function sparsevec(
	config: PgSparseVectorConfig,
): PgSparseVectorBuilder;
export function sparsevec(
	name: string,
	config: PgSparseVectorConfig,
): PgSparseVectorBuilder;
export function sparsevec(a: string | PgSparseVectorConfig, b?: PgSparseVectorConfig) {
	const { name, config } = getColumnNameAndConfig<PgSparseVectorConfig>(a, b);
	return new PgSparseVectorBuilder(name, config);
}
