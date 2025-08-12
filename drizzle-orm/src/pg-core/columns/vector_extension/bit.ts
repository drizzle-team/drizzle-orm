import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export class PgBinaryVectorBuilder<TDimensions extends number> extends PgColumnBuilder<
	{
		name: string;
		dataType: 'string binary';
		data: string;
		driverParam: string;
		enumValues: undefined;
		dimensions: TDimensions;
	},
	{ dimensions: TDimensions }
> {
	static override readonly [entityKind]: string = 'PgBinaryVectorBuilder';

	constructor(name: string, config: PgBinaryVectorConfig<TDimensions>) {
		super(name, 'string binary', 'PgBinaryVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgBinaryVector(
			table,
			this.config as any,
		);
	}
}

export class PgBinaryVector<T extends ColumnBaseConfig<'string binary'> & { dimensions: number }>
	extends PgColumn<T, { dimensions: T['dimensions'] }>
{
	static override readonly [entityKind]: string = 'PgBinaryVector';

	readonly dimensions = this.config.dimensions;

	getSQLType(): string {
		return `bit(${this.dimensions})`;
	}
}

export interface PgBinaryVectorConfig<TDimensions extends number = number> {
	dimensions: TDimensions;
}

export function bit<D extends number>(
	config: PgBinaryVectorConfig<D>,
): PgBinaryVectorBuilder<D>;
export function bit<D extends number>(
	name: string,
	config: PgBinaryVectorConfig<D>,
): PgBinaryVectorBuilder<D>;
export function bit(a: string | PgBinaryVectorConfig, b?: PgBinaryVectorConfig) {
	const { name, config } = getColumnNameAndConfig<PgBinaryVectorConfig>(a, b);
	return new PgBinaryVectorBuilder(name, config);
}
