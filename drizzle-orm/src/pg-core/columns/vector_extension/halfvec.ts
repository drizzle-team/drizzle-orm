import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgHalfVectorBuilderInitial<TName extends string> = PgHalfVectorBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'PgHalfVector';
	data: number[];
	driverParam: string;
	enumValues: undefined;
}>;

export class PgHalfVectorBuilder<T extends ColumnBuilderBaseConfig<'array', 'PgHalfVector'>> extends PgColumnBuilder<
	T,
	{ dimensions: number | undefined }
> {
	static readonly [entityKind]: string = 'PgHalfVectorBuilder';

	constructor(name: string, config: PgHalfVectorConfig) {
		super(name, 'array', 'PgHalfVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgHalfVector<MakeColumnConfig<T, TTableName>> {
		return new PgHalfVector<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgHalfVector<T extends ColumnBaseConfig<'array', 'PgHalfVector'>>
	extends PgColumn<T, { dimensions: number | undefined }>
{
	static readonly [entityKind]: string = 'PgHalfVector';

	readonly dimensions = this.config.dimensions;

	getSQLType(): string {
		return `halfvec(${this.dimensions})`;
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

export function halfvec<TName extends string>(
	name: TName,
	config: PgHalfVectorConfig,
): PgHalfVectorBuilderInitial<TName> {
	return new PgHalfVectorBuilder(name, config);
}
