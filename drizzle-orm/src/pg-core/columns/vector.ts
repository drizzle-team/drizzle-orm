import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgVectorBuilderInitial<TName extends string> = PgVectorBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'PgVector';
	data: number[];
	driverParam: string;
	enumValues: undefined;
}>;

export class PgVectorBuilder<T extends ColumnBuilderBaseConfig<'array', 'PgVector'>> extends PgColumnBuilder<
	T,
	{ dimensions: number | undefined }
> {
	static readonly [entityKind]: string = 'PgVectorBuilder';

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

// TODO: adding mappers
export class PgVector<T extends ColumnBaseConfig<'array', 'PgVector'>>
	extends PgColumn<T, { dimensions: number | undefined }>
{
	static readonly [entityKind]: string = 'PgVector';

	readonly dimensions = this.config.dimensions;

	getSQLType(): string {
		return `vector(${this.dimensions})`;
	}
}

export interface PgVectorConfig {
	dimensions: number;
}

export function vector<TName extends string>(
	name: TName,
	config: PgVectorConfig,
): PgVectorBuilderInitial<TName> {
	return new PgVectorBuilder(name, config);
}
