import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgSparseVectorBuilderInitial<TName extends string> = PgSparseVectorBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgSparseVector';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgSparseVectorBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgSparseVector'>>
	extends PgColumnBuilder<
		T,
		{ dimensions: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'PgSparseVectorBuilder';

	constructor(name: string, config: PgSparseVectorConfig) {
		super(name, 'string', 'PgSparseVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgSparseVector<MakeColumnConfig<T, TTableName>> {
		return new PgSparseVector<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgSparseVector<T extends ColumnBaseConfig<'string', 'PgSparseVector'>>
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
): PgSparseVectorBuilderInitial<''>;
export function sparsevec<TName extends string>(
	name: TName,
	config: PgSparseVectorConfig,
): PgSparseVectorBuilderInitial<TName>;
export function sparsevec(a: string | PgSparseVectorConfig, b?: PgSparseVectorConfig) {
	const { name, config } = getColumnNameAndConfig<PgSparseVectorConfig>(a, b);
	return new PgSparseVectorBuilder(name, config);
}
