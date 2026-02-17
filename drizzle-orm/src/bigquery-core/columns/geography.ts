import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

// GEOGRAPHY - Geospatial data in WKT or GeoJSON format
export type BigQueryGeographyBuilderInitial<TName extends string> = BigQueryGeographyBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'BigQueryGeography';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryGeographyBuilder<T extends ColumnBuilderBaseConfig<'string', 'BigQueryGeography'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryGeographyBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'BigQueryGeography');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryGeography<MakeColumnConfig<T, TTableName>> {
		return new BigQueryGeography<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryGeography<T extends ColumnBaseConfig<'string', 'BigQueryGeography'>> extends BigQueryColumn<T> {
	static override readonly [entityKind]: string = 'BigQueryGeography';

	getSQLType(): string {
		return 'GEOGRAPHY';
	}

	// BigQuery returns GEOGRAPHY as GeoJSON object or WKT string
	// We keep it as string for simplicity - user can parse if needed
}

export function geography(): BigQueryGeographyBuilderInitial<''>;
export function geography<TName extends string>(name: TName): BigQueryGeographyBuilderInitial<TName>;
export function geography(a?: string) {
	const { name } = getColumnNameAndConfig<undefined>(a, undefined);
	return new BigQueryGeographyBuilder(name);
}
