import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

export type BigQueryJsonBuilderInitial<TName extends string> = BigQueryJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'BigQueryJson';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'BigQueryJson'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'BigQueryJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryJson<MakeColumnConfig<T, TTableName>> {
		return new BigQueryJson<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryJson<T extends ColumnBaseConfig<'json', 'BigQueryJson'>> extends BigQueryColumn<T> {
	static override readonly [entityKind]: string = 'BigQueryJson';

	getSQLType(): string {
		return 'JSON';
	}

	override mapFromDriverValue(value: string | object): unknown {
		if (typeof value === 'string') {
			return JSON.parse(value);
		}
		return value;
	}

	override mapToDriverValue(value: unknown): string {
		return JSON.stringify(value);
	}
}

export function json(): BigQueryJsonBuilderInitial<''>;
export function json<TName extends string>(name: TName): BigQueryJsonBuilderInitial<TName>;
export function json(name?: string) {
	return new BigQueryJsonBuilder(name ?? '');
}
