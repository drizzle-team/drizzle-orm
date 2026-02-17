import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

export type BigQueryBoolBuilderInitial<TName extends string> = BigQueryBoolBuilder<{
	name: TName;
	dataType: 'boolean';
	columnType: 'BigQueryBool';
	data: boolean;
	driverParam: boolean;
	enumValues: undefined;
}>;

export class BigQueryBoolBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'BigQueryBool'>>
	extends BigQueryColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'BigQueryBoolBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'BigQueryBool');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryBool<MakeColumnConfig<T, TTableName>> {
		return new BigQueryBool<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryBool<T extends ColumnBaseConfig<'boolean', 'BigQueryBool'>> extends BigQueryColumn<T> {
	static override readonly [entityKind]: string = 'BigQueryBool';

	getSQLType(): string {
		return 'BOOL';
	}
}

export function bool(): BigQueryBoolBuilderInitial<''>;
export function bool<TName extends string>(name: TName): BigQueryBoolBuilderInitial<TName>;
export function bool(name?: string) {
	return new BigQueryBoolBuilder(name ?? '');
}
