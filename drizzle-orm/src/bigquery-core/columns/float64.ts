import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

export type BigQueryFloat64BuilderInitial<TName extends string> = BigQueryFloat64Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'BigQueryFloat64';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class BigQueryFloat64Builder<T extends ColumnBuilderBaseConfig<'number', 'BigQueryFloat64'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryFloat64Builder';

	constructor(name: T['name']) {
		super(name, 'number', 'BigQueryFloat64');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryFloat64<MakeColumnConfig<T, TTableName>> {
		return new BigQueryFloat64<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryFloat64<T extends ColumnBaseConfig<'number', 'BigQueryFloat64'>> extends BigQueryColumn<T> {
	static override readonly [entityKind]: string = 'BigQueryFloat64';

	getSQLType(): string {
		return 'FLOAT64';
	}
}

export function float64(): BigQueryFloat64BuilderInitial<''>;
export function float64<TName extends string>(name: TName): BigQueryFloat64BuilderInitial<TName>;
export function float64(name?: string) {
	return new BigQueryFloat64Builder(name ?? '');
}
