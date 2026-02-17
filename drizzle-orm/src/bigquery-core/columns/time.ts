import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

// TIME is always returned as a string (HH:MM:SS[.SSSSSS])
export type BigQueryTimeBuilderInitial<TName extends string> = BigQueryTimeBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'BigQueryTime';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryTimeBuilder<T extends ColumnBuilderBaseConfig<'string', 'BigQueryTime'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryTimeBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'BigQueryTime');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryTime<MakeColumnConfig<T, TTableName>> {
		return new BigQueryTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryTime<T extends ColumnBaseConfig<'string', 'BigQueryTime'>> extends BigQueryColumn<T> {
	static override readonly [entityKind]: string = 'BigQueryTime';

	getSQLType(): string {
		return 'TIME';
	}

	override mapFromDriverValue(value: string | { value: string }): string {
		return typeof value === 'object' && 'value' in value ? value.value : value;
	}
}

export function time(): BigQueryTimeBuilderInitial<''>;
export function time<TName extends string>(name: TName): BigQueryTimeBuilderInitial<TName>;
export function time(name?: string) {
	return new BigQueryTimeBuilder(name ?? '');
}
