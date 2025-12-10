import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

// INTERVAL - Duration type in BigQuery
// Canonical format: "Y-M D H:M:S" (year-month day hour:minute:second)
export type BigQueryIntervalBuilderInitial<TName extends string> = BigQueryIntervalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'BigQueryInterval';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryIntervalBuilder<T extends ColumnBuilderBaseConfig<'string', 'BigQueryInterval'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryIntervalBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'BigQueryInterval');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryInterval<MakeColumnConfig<T, TTableName>> {
		return new BigQueryInterval<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryInterval<T extends ColumnBaseConfig<'string', 'BigQueryInterval'>> extends BigQueryColumn<T> {
	static override readonly [entityKind]: string = 'BigQueryInterval';

	getSQLType(): string {
		return 'INTERVAL';
	}

	// BigQuery INTERVAL is returned in canonical format: "Y-M D H:M:S"
	// Keep as string, user can parse if needed
}

export function interval(): BigQueryIntervalBuilderInitial<''>;
export function interval<TName extends string>(name: TName): BigQueryIntervalBuilderInitial<TName>;
export function interval(a?: string) {
	const { name } = getColumnNameAndConfig<undefined>(a, undefined);
	return new BigQueryIntervalBuilder(name);
}
