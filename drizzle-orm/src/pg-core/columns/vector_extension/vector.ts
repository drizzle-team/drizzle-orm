import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export class PgVectorBuilder<TDimensions extends number> extends PgColumnBuilder<
	{
		name: string;
		dataType: 'array vector';
		data: number[];
		driverParam: string;
		enumValues: undefined;
		dimensions: TDimensions;
	},
	{ dimensions: TDimensions }
> {
	static override readonly [entityKind]: string = 'PgVectorBuilder';

	constructor(name: string, config: PgVectorConfig<TDimensions>) {
		super(name, 'array vector', 'PgVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgVector(
			table,
			this.config as any,
		);
	}
}

export class PgVector<T extends ColumnBaseConfig<'array vector'> & { dimensions: number | undefined }>
	extends PgColumn<T, { dimensions: T['dimensions'] }>
{
	static override readonly [entityKind]: string = 'PgVector';

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

export interface PgVectorConfig<TDimensions extends number = number> {
	dimensions: TDimensions;
}

export function vector<D extends number>(
	config: PgVectorConfig<D>,
): PgVectorBuilder<D>;
export function vector<D extends number>(
	name: string,
	config: PgVectorConfig<D>,
): PgVectorBuilder<D>;
export function vector(a: string | PgVectorConfig, b?: PgVectorConfig) {
	const { name, config } = getColumnNameAndConfig<PgVectorConfig>(a, b);
	return new PgVectorBuilder(name, config);
}
