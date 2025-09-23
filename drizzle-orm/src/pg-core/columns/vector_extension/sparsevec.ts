import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export class PgSparseVectorBuilder extends PgColumnBuilder<
	{
		dataType: 'string sparsevec';
		data: string;
		driverParam: string;
	},
	{ dimensions: number | undefined }
> {
	static override readonly [entityKind]: string = 'PgSparseVectorBuilder';

	constructor(name: string, config: PgSparseVectorConfig) {
		super(name, 'string sparsevec', 'PgSparseVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgSparseVector(
			table,
			this.config as any,
		);
	}
}

export class PgSparseVector<T extends ColumnBaseConfig<'string sparsevec'>>
	extends PgColumn<T, { dimensions: number | undefined }>
{
	static override readonly [entityKind]: string = 'PgSparseVector';

	readonly dimensions = this.config.dimensions;

	getSQLType(): string {
		return `sparsevec(${this.dimensions})`;
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
