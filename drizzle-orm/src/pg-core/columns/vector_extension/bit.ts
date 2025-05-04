import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgBinaryVectorBuilderInitial<TName extends string, TDimensions extends number> = PgBinaryVectorBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgBinaryVector';
	data: string;
	driverParam: string;
	enumValues: undefined;
	dimensions: TDimensions;
}>;

export class PgBinaryVectorBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'PgBinaryVector'> & { dimensions: number },
> extends PgColumnBuilder<
	T,
	{ dimensions: T['dimensions'] }
> {
	static override readonly [entityKind]: string = 'PgBinaryVectorBuilder';

	constructor(name: string, config: PgBinaryVectorConfig<T['dimensions']>) {
		super(name, 'string', 'PgBinaryVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgBinaryVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }> {
		return new PgBinaryVector<MakeColumnConfig<T, TTableName> & { dimensions: T['dimensions'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgBinaryVector<T extends ColumnBaseConfig<'string', 'PgBinaryVector'> & { dimensions: number }>
	extends PgColumn<T, { dimensions: T['dimensions'] }, { dimensions: T['dimensions'] }>
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
): PgBinaryVectorBuilderInitial<'', D>;
export function bit<TName extends string, D extends number>(
	name: TName,
	config: PgBinaryVectorConfig<D>,
): PgBinaryVectorBuilderInitial<TName, D>;
export function bit(a: string | PgBinaryVectorConfig, b?: PgBinaryVectorConfig) {
	const { name, config } = getColumnNameAndConfig<PgBinaryVectorConfig>(a, b);
	return new PgBinaryVectorBuilder(name, config);
}
