import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgBinaryVectorBuilderInitial<TName extends string> = PgBinaryVectorBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgBinaryVector';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgBinaryVectorBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgBinaryVector'>>
	extends PgColumnBuilder<
		T,
		{ dimensions: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'PgBinaryVectorBuilder';

	constructor(name: string, config: PgBinaryVectorConfig) {
		super(name, 'string', 'PgBinaryVector');
		this.config.dimensions = config.dimensions;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgBinaryVector<MakeColumnConfig<T, TTableName>> {
		return new PgBinaryVector<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgBinaryVector<T extends ColumnBaseConfig<'string', 'PgBinaryVector'>>
	extends PgColumn<T, { dimensions: number | undefined }>
{
	static override readonly [entityKind]: string = 'PgBinaryVector';

	readonly dimensions = this.config.dimensions;

	getSQLType(): string {
		return `bit(${this.dimensions})`;
	}
}

export interface PgBinaryVectorConfig {
	dimensions: number;
}

export function bit(
	config: PgBinaryVectorConfig,
): PgBinaryVectorBuilderInitial<''>;
export function bit<TName extends string>(
	name: TName,
	config: PgBinaryVectorConfig,
): PgBinaryVectorBuilderInitial<TName>;
export function bit(a: string | PgBinaryVectorConfig, b?: PgBinaryVectorConfig) {
	const { name, config } = getColumnNameAndConfig<PgBinaryVectorConfig>(a, b);
	return new PgBinaryVectorBuilder(name, config);
}
