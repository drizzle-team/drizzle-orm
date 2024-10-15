import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgVectorBuilderInitial<TName extends string> = PgVectorBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'PgVector';
	data: number[];
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgVectorBuilder<T extends ColumnBuilderBaseConfig<'array', 'PgVector'>> extends PgColumnBuilder<
	T,
	{ dimensions: number | undefined }
> {
	static override readonly [entityKind]: string = 'PgVectorBuilder';

	constructor(name: string, config: PgVectorConfig) {
		super(name, 'array', 'PgVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgVector<MakeColumnConfig<T, TTableName>> {
		return new PgVector<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgVector<T extends ColumnBaseConfig<'array', 'PgVector'>>
	extends PgColumn<T, { dimensions: number | undefined }>
{
	static override readonly [entityKind]: string = 'PgVector';

	readonly dimensions = this.config.dimensions;

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

export interface PgVectorConfig {
	dimensions: number;
}

export function vector(
	config: PgVectorConfig,
): PgVectorBuilderInitial<''>;
export function vector<TName extends string>(
	name: TName,
	config: PgVectorConfig,
): PgVectorBuilderInitial<TName>;
export function vector(a: string | PgVectorConfig, b?: PgVectorConfig) {
	const { name, config } = getColumnNameAndConfig<PgVectorConfig>(a, b);
	return new PgVectorBuilder(name, config);
}
